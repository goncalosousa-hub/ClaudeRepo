import { createHash, timingSafeEqual } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { applyOp, createRoomState } from '../shared/ops';
import type { Op, OpEnvelope, PresencePatch, PresenceState } from '../shared/types';
import type { RoomDoc, Storage } from './storage';

// No 0/o, 1/l/i: codes are easy to read aloud or type from a phone.
const newRoomId = customAlphabet('abcdefghjkmnpqrstuvwxyz23456789', 8);

export interface LiveRoom {
  id: string;
  doc: RoomDoc;
  dirty: boolean;
  firstDirtyAt: number;
  saveTimer: NodeJS.Timeout | null;
  saving: Promise<void>;
  /** user id -> presence (only users with at least one open socket) */
  presence: Map<string, PresenceState>;
  /** user id -> socket ids (a user can have several tabs open) */
  userSockets: Map<string, Set<string>>;
  idleSince: number;
}

export interface RoomManagerOptions {
  saveDelayMs?: number;
  maxSaveDelayMs?: number;
  idleEvictMs?: number;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Keeps the rooms that are in use in memory (the authoritative copy), applies ops
 * and persists each room shortly after it changes.
 */
export class RoomManager {
  private live = new Map<string, LiveRoom>();
  private loading = new Map<string, Promise<LiveRoom | null>>();
  private evictTimer: NodeJS.Timeout;
  private closed = false;
  private opts: Required<RoomManagerOptions>;

  constructor(
    private storage: Storage,
    opts: RoomManagerOptions = {},
  ) {
    this.opts = { saveDelayMs: 800, maxSaveDelayMs: 4_000, idleEvictMs: 30 * 60_000, ...opts };
    this.evictTimer = setInterval(() => this.evictIdle(), 60_000);
    this.evictTimer.unref();
  }

  async create(name: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = newRoomId();
      if (this.live.has(id) || (await this.storage.load(id))) continue;
      const doc: RoomDoc = { v: 1, seq: 0, state: createRoomState(id, name, Date.now()), secrets: {}, lastSeen: {} };
      await this.storage.save(id, doc);
      return id;
    }
    throw new Error('could not allocate a room id');
  }

  async get(id: string): Promise<LiveRoom | null> {
    const hit = this.live.get(id);
    if (hit) return hit;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.storage
        .load(id)
        .then((doc) => {
          if (!doc) return null;
          const room: LiveRoom = {
            id,
            doc,
            dirty: false,
            firstDirtyAt: 0,
            saveTimer: null,
            saving: Promise.resolve(),
            presence: new Map(),
            userSockets: new Map(),
            idleSince: Date.now(),
          };
          this.live.set(id, room);
          return room;
        })
        .finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }

  /** Applies an op to the authoritative state. Throws OpError when the op is invalid. */
  apply(room: LiveRoom, op: Op, by: string, cid?: string): OpEnvelope {
    const at = Date.now();
    const seq = room.doc.seq + 1;
    applyOp(room.doc.state, op, { by, at, seq, cid });
    room.doc.seq = seq;
    this.markDirty(room);
    return cid ? { seq, op, by, at, cid } : { seq, op, by, at };
  }

  /** The first browser to use a user id "claims" it; later connections must present the same secret. */
  authenticate(room: LiveRoom, userId: string, secret: string): boolean {
    const hash = sha256(secret);
    const known = room.doc.secrets[userId];
    if (!known) {
      room.doc.secrets[userId] = hash;
      this.markDirty(room);
      return true;
    }
    return timingSafeEqual(Buffer.from(known), Buffer.from(hash));
  }

  /** Returns true when this is the user's first open socket in the room (they just came online). */
  addSocket(room: LiveRoom, socketId: string, userId: string): boolean {
    let sockets = room.userSockets.get(userId);
    const first = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      room.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);
    if (first) {
      room.presence.set(userId, { userId, tab: null, board: null, viewing: null, typing: null, dragging: null });
    }
    return first;
  }

  /** Returns true when the user has no sockets left (they went offline). */
  removeSocket(room: LiveRoom, socketId: string, userId: string): boolean {
    const sockets = room.userSockets.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size > 0) return false;
    room.userSockets.delete(userId);
    room.presence.delete(userId);
    room.doc.lastSeen[userId] = Date.now();
    this.markDirty(room);
    if (room.userSockets.size === 0) room.idleSince = Date.now();
    return true;
  }

  updatePresence(room: LiveRoom, userId: string, patch: PresencePatch): PresenceState | null {
    const current = room.presence.get(userId);
    if (!current) return null;
    const next = { ...current, ...patch, userId };
    room.presence.set(userId, next);
    return next;
  }

  onlineCount(room: LiveRoom) {
    return room.userSockets.size;
  }

  private markDirty(room: LiveRoom) {
    room.dirty = true;
    const now = Date.now();
    if (!room.firstDirtyAt) room.firstDirtyAt = now;
    this.schedule(room, Math.min(this.opts.saveDelayMs, room.firstDirtyAt + this.opts.maxSaveDelayMs - now));
  }

  private schedule(room: LiveRoom, delay: number) {
    if (this.closed) return;
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => void this.flush(room), Math.max(0, delay));
  }

  /** Saves the room if it has unsaved changes. Saves of the same room never overlap. */
  flush(room: LiveRoom): Promise<void> {
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    const run = async () => {
      if (!room.dirty) return;
      room.dirty = false;
      room.firstDirtyAt = 0;
      try {
        await this.storage.save(room.id, room.doc);
      } catch (err) {
        console.error(`[rooms] could not save room ${room.id}:`, err);
        room.dirty = true;
        this.schedule(room, 5_000);
      }
    };
    room.saving = room.saving.then(run, run);
    return room.saving;
  }

  async flushAll() {
    await Promise.all([...this.live.values()].map((room) => this.flush(room)));
  }

  private evictIdle() {
    const now = Date.now();
    for (const room of this.live.values()) {
      if (room.userSockets.size > 0 || now - room.idleSince < this.opts.idleEvictMs) continue;
      void this.flush(room).then(() => {
        if (room.userSockets.size === 0 && !room.dirty) this.live.delete(room.id);
      });
    }
  }

  async close() {
    clearInterval(this.evictTimer);
    this.closed = true;
    // Sockets closing during shutdown can dirty rooms again (last seen), so flush until clean.
    for (let i = 0; i < 5; i++) {
      await this.flushAll();
      if (![...this.live.values()].some((room) => room.dirty)) break;
    }
  }
}
