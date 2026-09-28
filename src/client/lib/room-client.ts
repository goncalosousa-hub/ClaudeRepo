// Connection to one room: keeps the state in sync with the server and applies the user's own
// changes immediately ("optimistic updates").
//
//   displayed state = confirmed state (from the server) + my pending ops re-applied on top
//
// Every op is applied with the same reducer the server uses (shared/ops.ts), so once the server
// confirms an op the confirmed state ends up identical to the server's.
import { io, type Socket } from 'socket.io-client';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import { applyOp, OpError } from '../../shared/ops';
import type {
  CursorState,
  JoinAck,
  Op,
  OpAck,
  OpEnvelope,
  PresencePatch,
  PresenceState,
  RoomState,
  SyncAck,
} from '../../shared/types';
import type { LocalUser } from './identity';

export type RoomStatus = 'connecting' | 'joined' | 'reconnecting' | 'error';

export interface Flash {
  color: string;
  by: string;
  until: number;
}

export interface RoomSnapshot {
  status: RoomStatus;
  error: string | null;
  room: RoomState | null;
  /** Online members (keyed by user id), without cursors */
  presence: Record<string, PresenceState>;
  lastSeen: Record<string, number>;
  /** Cards recently changed by someone else (for a short highlight) */
  flashes: Record<string, Flash>;
  pendingCount: number;
}

interface PendingOp {
  cid: string;
  op: Op;
  at: number;
  attempts: number;
}

const FATAL_ERRORS = new Set(['room_not_found', 'auth_failed', 'invalid_payload', 'limit_members']);

type Listener = () => void;
type CursorListener = (userId: string, cursor: CursorState | null) => void;
type OpListener = (env: OpEnvelope, mine: boolean) => void;
type ErrorListener = (code: string, op: Op) => void;

function throttle<T>(ms: number, send: (value: T) => void) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: { value: T } | null = null;
  const fire = () => {
    timer = null;
    if (!queued) return;
    last = Date.now();
    const { value } = queued;
    queued = null;
    send(value);
  };
  const call = (value: T) => {
    queued = { value };
    const wait = last + ms - Date.now();
    if (wait <= 0 && !timer) fire();
    else if (!timer) timer = setTimeout(fire, Math.max(0, wait));
  };
  call.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    queued = null;
  };
  return call;
}

export class RoomClient {
  readonly roomId: string;
  private user: LocalUser;
  private socket: Socket;
  private confirmed: RoomState | null = null;
  private seq = 0;
  private pending: PendingOp[] = [];
  private syncing = false;
  private destroyed = false;
  private everJoined = false;
  private myPresence: PresencePatch = {};
  private queuedPresence: PresencePatch = {};
  private snapshot: RoomSnapshot = {
    status: 'connecting',
    error: null,
    room: null,
    presence: {},
    lastSeen: {},
    flashes: {},
    pendingCount: 0,
  };
  private listeners = new Set<Listener>();
  private cursorListeners = new Set<CursorListener>();
  private opListeners = new Set<OpListener>();
  private errorListeners = new Set<ErrorListener>();
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  private sendPresence = throttle<null>(80, () => {
    const patch = this.queuedPresence;
    this.queuedPresence = {};
    if (this.snapshot.status === 'joined' && Object.keys(patch).length) this.socket.emit('presence', patch);
  });

  private sendCursorThrottled = throttle<CursorState | null>(50, (c) => {
    if (this.snapshot.status === 'joined') this.socket.volatile.emit('cursor', c);
  });

  constructor(roomId: string, user: LocalUser, opts: { url?: string; transports?: string[] } = {}) {
    this.roomId = roomId;
    this.user = user;
    this.socket = io(opts.url ?? '', {
      autoConnect: false,
      transports: opts.transports,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    this.socket.on('connect', () => this.join());
    this.socket.on('disconnect', () => {
      if (this.destroyed || this.snapshot.status === 'error') return;
      this.set({ status: this.everJoined ? 'reconnecting' : 'connecting', presence: {} });
    });
    this.socket.on('connect_error', () => {
      if (this.snapshot.status === 'joined') this.set({ status: 'reconnecting' });
    });
    this.socket.on('op', (env: OpEnvelope) => this.handleOp(env));
    this.socket.on('presence', (p: PresenceState) => {
      if (p.userId === this.user.id) return;
      this.set({ presence: { ...this.snapshot.presence, [p.userId]: p } });
    });
    this.socket.on('presence:leave', ({ userId, at }: { userId: string; at: number }) => {
      if (userId === this.user.id) return;
      const presence = { ...this.snapshot.presence };
      delete presence[userId];
      this.set({ presence, lastSeen: { ...this.snapshot.lastSeen, [userId]: at } });
      for (const l of this.cursorListeners) l(userId, null);
    });
    this.socket.on('cursor', ({ userId, cursor }: { userId: string; cursor: CursorState | null }) => {
      for (const l of this.cursorListeners) l(userId, cursor);
    });
    this.socket.connect();
  }

  get me() {
    return this.user.id;
  }

  // --- subscriptions (useSyncExternalStore) ---------------------------------

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  onCursor(listener: CursorListener) {
    this.cursorListeners.add(listener);
    return () => {
      this.cursorListeners.delete(listener);
    };
  }

  /** Called for every confirmed op (mine or someone else's). */
  onOp(listener: OpListener) {
    this.opListeners.add(listener);
    return () => {
      this.opListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener) {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private set(patch: Partial<RoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  // --- protocol ------------------------------------------------------------------

  private join() {
    const { id, secret, name, color, avatar } = this.user;
    this.socket.emit('join', { roomId: this.roomId, user: { id, secret, name, color, avatar } }, (ack: JoinAck) => {
      if (this.destroyed) return;
      if (!ack?.ok) {
        const error = ack?.error ?? 'server_error';
        if (FATAL_ERRORS.has(error)) {
          this.socket.disconnect();
          this.set({ status: 'error', error });
        } else {
          // Temporary problem: reconnect (join happens again on connect).
          this.socket.disconnect();
          setTimeout(() => !this.destroyed && this.socket.connect(), 2000);
        }
        return;
      }
      this.everJoined = true;
      this.confirmed = ack.state;
      this.seq = ack.seq;
      const presence: Record<string, PresenceState> = {};
      for (const p of ack.presence) if (p.userId !== this.user.id) presence[p.userId] = p;
      this.set({ status: 'joined', error: null, presence, lastSeen: ack.lastSeen });
      this.recompute();
      // Ops made while offline (or not yet confirmed) are sent again: they are idempotent.
      for (const p of this.pending) this.send(p);
      if (Object.keys(this.myPresence).length) this.socket.emit('presence', this.myPresence);
    });
  }

  private handleOp(env: OpEnvelope) {
    if (!this.confirmed || this.syncing) return;
    if (env.seq <= this.seq) return;
    if (env.seq !== this.seq + 1) return this.resync();
    try {
      this.confirmed = produce(this.confirmed, (draft) => applyOp(draft, env.op, env));
    } catch (err) {
      console.warn('[room] could not apply a confirmed op, resyncing', err);
      return this.resync();
    }
    this.seq = env.seq;
    const mine = !!env.cid && this.pending.some((p) => p.cid === env.cid);
    if (mine) this.pending = this.pending.filter((p) => p.cid !== env.cid);
    if (env.by !== this.user.id) this.flash(env);
    this.recompute();
    for (const l of this.opListeners) l(env, env.by === this.user.id);
  }

  private resync() {
    if (this.syncing) return;
    this.syncing = true;
    this.socket.timeout(10_000).emit('sync', (err: Error | null, ack: SyncAck) => {
      this.syncing = false;
      if (err || !ack?.ok) {
        this.socket.disconnect().connect();
        return;
      }
      this.confirmed = ack.state;
      this.seq = ack.seq;
      this.recompute();
    });
  }

  private recompute() {
    if (!this.confirmed) return;
    let room = this.confirmed;
    for (const p of this.pending) {
      try {
        room = produce(room, (draft) => applyOp(draft, p.op, { by: this.user.id, at: p.at, seq: -1, cid: p.cid }));
      } catch {
        // No longer valid on top of the latest state; the server will reject it too.
      }
    }
    this.set({ room, pendingCount: this.pending.length });
  }

  private send(p: PendingOp) {
    p.attempts++;
    this.socket.timeout(10_000).emit('op', { cid: p.cid, op: p.op }, (err: Error | null, ack: OpAck) => {
      if (this.destroyed || !this.pending.includes(p)) return;
      if (err) {
        // No answer: try again while connected (ops are idempotent), then give up.
        if (this.socket.connected && p.attempts < 3) this.send(p);
        else if (this.socket.connected) this.reject(p, 'timeout');
        return;
      }
      if (ack.ok) {
        this.pending = this.pending.filter((x) => x !== p);
        this.recompute();
      } else {
        this.reject(p, ack.error);
      }
    });
  }

  private reject(p: PendingOp, code: string) {
    this.pending = this.pending.filter((x) => x !== p);
    this.recompute();
    for (const l of this.errorListeners) l(code, p.op);
  }

  private flash(env: OpEnvelope) {
    const member = this.confirmed?.members[env.by];
    if (!member) return;
    let key: string | null = null;
    if (env.op.type === 'board.move') key = env.op.key;
    else if (env.op.type === 'anime.add') key = env.op.anime.key;
    else if (env.op.type === 'review.set') key = env.op.key;
    if (!key) return;
    const now = Date.now();
    const flashes: Record<string, Flash> = {};
    for (const [k, f] of Object.entries(this.snapshot.flashes)) if (f.until > now) flashes[k] = f;
    flashes[key] = { color: member.color, by: env.by, until: now + 1800 };
    this.set({ flashes });
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      const t = Date.now();
      const left: Record<string, Flash> = {};
      for (const [k, f] of Object.entries(this.snapshot.flashes)) if (f.until > t) left[k] = f;
      this.set({ flashes: left });
    }, 1900);
  }

  // --- public API ------------------------------------------------------------------

  /**
   * Applies an op locally right away and sends it to the server.
   * Returns an error code when the op is invalid on the current state.
   */
  dispatch(op: Op): string | null {
    const room = this.snapshot.room;
    if (!room) return 'not_joined';
    const p: PendingOp = { cid: nanoid(12), op, at: Date.now(), attempts: 0 };
    try {
      produce(room, (draft) => applyOp(draft, op, { by: this.user.id, at: p.at, seq: -1, cid: p.cid }));
    } catch (err) {
      return err instanceof OpError ? err.code : 'invalid_op';
    }
    this.pending.push(p);
    this.recompute();
    if (this.snapshot.status === 'joined') this.send(p);
    return null;
  }

  setPresence(patch: PresencePatch) {
    this.myPresence = { ...this.myPresence, ...patch };
    this.queuedPresence = { ...this.queuedPresence, ...patch };
    this.sendPresence(null);
  }

  sendCursor(cursor: CursorState | null) {
    this.sendCursorThrottled(cursor);
  }

  /** Profile changed (name, colour, avatar). */
  updateUser(user: LocalUser) {
    const changed = user.name !== this.user.name || user.color !== this.user.color || user.avatar !== this.user.avatar;
    this.user = user;
    if (changed && this.snapshot.room?.members[user.id]) {
      this.dispatch({ type: 'member.update', name: user.name, color: user.color, avatar: user.avatar });
    }
  }

  destroy() {
    this.destroyed = true;
    this.sendPresence.cancel();
    this.sendCursorThrottled.cancel();
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.listeners.clear();
    this.cursorListeners.clear();
    this.opListeners.clear();
    this.errorListeners.clear();
  }
}
