import type { Server, Socket } from 'socket.io';
import { OpError } from '../shared/ops';
import { ownerAway } from '../shared/owner';
import { cursorSchema, joinSchema, opMessageSchema, presencePatchSchema } from '../shared/schema';
import { GROUP_BOARD, type AckError, type JoinAck, type Op, type OpAck, type SyncAck } from '../shared/types';
import type { AccountManager } from './accounts';
import type { LiveRoom, RoomManager } from './rooms';

/** Simple token bucket to stop a misbehaving client from flooding the room. */
class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private capacity: number,
    private perSecond: number,
  ) {
    this.tokens = capacity;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

const photoBy = (room: LiveRoom, key: string, id: string) => room.doc.state.photos?.[key]?.find((p) => p.id === id)?.by;

/**
 * Personal tier lists can only be changed by their owner; the group one by anyone. Only the room's
 * owner renames it or hands it over; the others can take it over once the owner has been away a week.
 * A photo is removed by whoever added it or by the room's owner.
 */
function authorize(op: Op, userId: string, room: LiveRoom, admin: boolean): string | null {
  const s = room.doc.state;
  if (s.global) return authorizeCommunity(op, userId, room, admin);
  switch (op.type) {
    case 'photo.remove': {
      const by = photoBy(room, op.key, op.id);
      return !by || by === userId || s.createdBy === userId ? null : 'forbidden';
    }
    case 'board.move':
      return op.board === GROUP_BOARD || op.board === userId ? null : 'forbidden';
    case 'board.copy':
    case 'board.clear':
      return op.board === userId ? null : 'forbidden';
    case 'anime.add':
      return !op.place || op.place.board === GROUP_BOARD || op.place.board === userId ? null : 'forbidden';
    case 'room.rename':
    case 'room.listed':
    case 'room.kind':
      return s.createdBy === userId ? null : 'not_owner';
    case 'room.owner': {
      if (s.createdBy === userId) return null;
      const ownerOnline = !!s.createdBy && room.presence.has(s.createdBy);
      return op.to === userId && ownerAway(s, room.doc.lastSeen, ownerOnline) ? null : 'not_owner';
    }
    default:
      return null;
  }
}

/**
 * The community spaces have hundreds of people: each one only changes their own tier list and the
 * titles and photos they added; the tiers, the name and the (missing) owner are fixed. The admins
 * (ADMINS) can remove any title or photo.
 */
function authorizeCommunity(op: Op, userId: string, room: LiveRoom, admin: boolean): string | null {
  switch (op.type) {
    case 'photo.remove': {
      const by = photoBy(room, op.key, op.id);
      return !by || by === userId || admin ? null : 'forbidden';
    }
    case 'board.move':
    case 'board.copy':
    case 'board.clear':
      return op.board === userId ? null : 'forbidden';
    case 'anime.add':
      return !op.place || op.place.board === userId ? null : 'forbidden';
    case 'anime.remove': {
      const title = room.doc.state.anime[op.key];
      return !title || title.addedBy === userId || admin ? null : 'forbidden';
    }
    case 'tiers.set':
    case 'room.rename':
    case 'room.listed':
    case 'room.kind':
    case 'room.owner':
      return 'forbidden';
    default:
      return null;
  }
}

type Ack<T> = (res: T) => void;
const noop = () => {};
const asAck = <T>(fn: unknown): Ack<T> => (typeof fn === 'function' ? (fn as Ack<T>) : noop);

export function attachRealtime(io: Server, rooms: RoomManager, accounts?: AccountManager, admins: Set<string> = new Set()) {
  io.on('connection', (socket: Socket) => {
    let ctx: { room: LiveRoom; userId: string; admin: boolean } | null = null;
    let joining = false;
    const opBucket = new TokenBucket(40, 15);
    const presenceBucket = new TokenBucket(40, 20);
    const cursorBucket = new TokenBucket(40, 30);

    socket.on('join', async (payload: unknown, ackFn: unknown) => {
      const ack = asAck<JoinAck>(ackFn);
      if (ctx || joining) return ack({ ok: false, error: 'already_joined' });
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'invalid_payload' });
      const { roomId, user, account } = parsed.data;

      joining = true;
      let room: LiveRoom | null;
      try {
        room = await rooms.get(roomId);
      } catch (err) {
        console.error('[realtime] could not load room', roomId, err);
        return ack({ ok: false, error: 'server_error' });
      } finally {
        joining = false;
      }
      if (!room) return ack({ ok: false, error: 'room_not_found' });
      if (socket.disconnected) return;
      if (!rooms.authenticate(room, user.id, user.secret)) return ack({ ok: false, error: 'auth_failed' });
      // An admin proves it with the account: its identity must be this one.
      let admin = false;
      if (account && accounts && admins.has(account)) {
        joining = true;
        const doc = await accounts.authenticate(account, user.secret).catch(() => null);
        joining = false;
        admin = doc?.userId === user.id;
        if (socket.disconnected) return;
      }

      const existing = room.doc.state.members[user.id];
      const changed =
        !existing ||
        existing.name !== user.name ||
        existing.color !== user.color ||
        existing.avatar !== user.avatar ||
        (existing.unit ?? '') !== user.unit;
      if (changed) {
        try {
          const member = { id: user.id, name: user.name, color: user.color, avatar: user.avatar, unit: user.unit };
          const env = rooms.apply(room, { type: 'member.join', member }, user.id);
          // Sent before this socket joins the channel: the newcomer gets it inside the state below.
          io.to(roomId).emit('op', env);
        } catch (err) {
          return ack({ ok: false, error: err instanceof OpError ? err.code : 'server_error' });
        }
      }

      ctx = { room, userId: user.id, admin };
      // No await between applying member.join and the ack: nothing else can interleave.
      void socket.join(roomId);
      if (rooms.addSocket(room, socket.id, user.id)) {
        socket.to(roomId).emit('presence', room.presence.get(user.id));
      }
      ack({
        ok: true,
        state: room.doc.state,
        seq: room.doc.seq,
        presence: [...room.presence.values()],
        lastSeen: room.doc.lastSeen,
        ...(admin ? { admin: true } : {}),
      });
      // The community space is always one click away: it does not go into "As tuas salas".
      if (account && accounts && !room.doc.state.global) {
        const visit = { id: roomId, name: room.doc.state.name };
        accounts.recordVisits(account, user.id, user.secret, [visit]).catch((err) => {
          console.error('[realtime] could not update the rooms of', account, err);
        });
      }
    });

    socket.on('op', (payload: unknown, ackFn: unknown) => {
      const ack = asAck<OpAck>(ackFn);
      if (!ctx) return ack({ ok: false, error: 'not_joined' });
      if (!opBucket.take()) return ack({ ok: false, error: 'rate_limited' });
      const parsed = opMessageSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'invalid_op' });
      const { cid } = parsed.data;
      const op = parsed.data.op as Op;
      const denied = authorize(op, ctx.userId, ctx.room, ctx.admin);
      if (denied) return ack({ ok: false, error: denied });
      try {
        const env = rooms.apply(ctx.room, op, ctx.userId, cid);
        io.to(ctx.room.id).emit('op', env);
        ack({ ok: true, seq: env.seq });
      } catch (err) {
        if (err instanceof OpError) return ack({ ok: false, error: err.code });
        console.error('[realtime] op failed', err);
        ack({ ok: false, error: 'server_error' });
      }
    });

    socket.on('presence', (payload: unknown) => {
      if (!ctx || !presenceBucket.take()) return;
      const parsed = presencePatchSchema.safeParse(payload);
      if (!parsed.success) return;
      const next = rooms.updatePresence(ctx.room, ctx.userId, parsed.data);
      if (next) socket.to(ctx.room.id).emit('presence', next);
    });

    socket.on('cursor', (payload: unknown) => {
      if (!ctx || !cursorBucket.take()) return;
      const parsed = cursorSchema.safeParse(payload);
      if (!parsed.success) return;
      socket.to(ctx.room.id).volatile.emit('cursor', { userId: ctx.userId, cursor: parsed.data });
    });

    socket.on('sync', (ackFn: unknown) => {
      const ack = asAck<SyncAck>(ackFn);
      if (!ctx) return ack({ ok: false, error: 'not_joined' } satisfies AckError);
      ack({ ok: true, state: ctx.room.doc.state, seq: ctx.room.doc.seq });
    });

    socket.on('disconnect', () => {
      if (!ctx) return;
      const { room, userId } = ctx;
      ctx = null;
      if (rooms.removeSocket(room, socket.id, userId)) {
        io.to(room.id).emit('presence:leave', { userId, at: room.doc.lastSeen[userId] });
      }
    });
  });
}
