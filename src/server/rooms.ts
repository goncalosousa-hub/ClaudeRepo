import { createHash, timingSafeEqual } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { applyOp, createRoomState, OpError } from '../shared/ops';
import { COMMUNITY_SECTIONS } from '../shared/constants';
import { communitySummary } from '../shared/media';
import type { CommunityRoom, Op, OpEnvelope, PresencePatch, PresenceState, RoomKind, RoomState } from '../shared/types';
import type { RoomDoc, RoomRow, Storage } from './storage';

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
  /** Deleted by an admin: never saved again (sockets closing late would bring it back). */
  deleted?: boolean;
}

export interface RoomManagerOptions {
  saveDelayMs?: number;
  maxSaveDelayMs?: number;
  idleEvictMs?: number;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** The ids of a title's photos, or of all the room's photos. */
function photoIds(s: RoomState, key: string | null): string[] {
  const lists = key ? [s.photos?.[key] ?? []] : Object.values(s.photos ?? {});
  return lists.flat().map((p) => p.id);
}

/**
 * Keeps the rooms that are in use in memory (the authoritative copy), applies ops
 * and persists each room shortly after it changes.
 */
export class RoomManager {
  private live = new Map<string, LiveRoom>();
  private loading = new Map<string, Promise<LiveRoom | null>>();
  /** The community rooms: read from storage once, then kept up to date as rooms change. */
  private directory: Map<string, Omit<CommunityRoom, 'online'>> | null = null;
  private directoryLoading: Promise<void> | null = null;
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

  async create(name: string, opts: { kind?: RoomKind; listed?: boolean } = {}): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = newRoomId();
      if (this.live.has(id) || (await this.storage.load(id))) continue;
      const doc: RoomDoc = { v: 1, seq: 0, state: createRoomState(id, name, Date.now(), null, opts), secrets: {}, lastSeen: {} };
      await this.storage.save(id, doc);
      if (doc.state.listed) this.directory?.set(id, communitySummary(doc.state));
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
    if (room.deleted) throw new OpError('room_not_found');
    const at = Date.now();
    const seq = room.doc.seq + 1;
    // Photos that leave the room (removed, with their title or with the person) are deleted from storage.
    const key = op.type === 'photo.remove' || op.type === 'anime.remove' ? op.key : null;
    const before = key || op.type === 'member.remove' ? photoIds(room.doc.state, key) : [];
    applyOp(room.doc.state, op, { by, at, seq, cid });
    room.doc.seq = seq;
    this.markDirty(room);
    if (before.length) {
      const kept = new Set(photoIds(room.doc.state, key));
      const gone = before.filter((id) => !kept.has(id));
      if (gone.length) {
        this.storage.deletePhotos(gone).catch((err) => console.error('[rooms] could not delete photos', gone, err));
      }
    }
    if (room.doc.state.listed) this.directory?.set(room.id, communitySummary(room.doc.state));
    else this.directory?.delete(room.id);
    return cid ? { seq, op, by, at, cid } : { seq, op, by, at };
  }

  /**
   * Takes someone out of a room (an admin deleting them): everyone in it gets the op, and the
   * identity is forgotten there (its secret and last visit), so the room keeps nothing of theirs.
   * Their open connections must be closed first (see admin-routes.ts).
   */
  removeMember(room: LiveRoom, userId: string, by: string): OpEnvelope | null {
    if (!room.doc.state.members[userId]) return null;
    const env = this.apply(room, { type: 'member.remove', id: userId }, by);
    delete room.doc.secrets[userId];
    delete room.doc.lastSeen[userId];
    return env;
  }

  /** The rooms (saved or in memory) where this user id is a member. */
  async roomsOf(userId: string): Promise<string[]> {
    const ids = new Set(await this.storage.roomsWithMember(userId));
    // The copy in memory is the current one.
    for (const room of this.live.values()) {
      if (room.doc.state.members[userId]) ids.add(room.id);
      else ids.delete(room.id);
    }
    return [...ids];
  }

  /** Every room that is not a community space (the admins' page), with who is in it right now. */
  async allRooms(): Promise<(RoomRow & { online: number })[]> {
    const rows = new Map((await this.storage.allRooms()).map((r) => [r.id, r]));
    for (const room of this.live.values()) {
      const s = room.doc.state;
      if (s.global) continue;
      const saved = rows.get(room.id);
      rows.set(room.id, {
        ...communitySummary(s),
        listed: !!s.listed,
        createdAt: s.createdAt,
        updatedAt: Math.max(communitySummary(s).updatedAt, saved?.updatedAt ?? 0),
      });
    }
    return [...rows.values()]
      .map((r) => {
        const room = this.live.get(r.id);
        return { ...r, online: room ? this.onlineCount(room) : 0 };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Deletes a room and its photos (not the community spaces). Returns the ids of the sockets that
   * were in it, for the caller to close.
   */
  async deleteRoom(id: string): Promise<string[] | null> {
    const room = await this.get(id);
    if (!room || room.doc.state.global) return null;
    room.deleted = true;
    room.dirty = false;
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.saveTimer = null;
    this.live.delete(id);
    this.directory?.delete(id);
    const sockets = [...room.userSockets.values()].flatMap((set) => [...set]);
    await room.saving;
    await this.storage.deleteRoom(id);
    const photos = photoIds(room.doc.state, null);
    if (photos.length) await this.storage.deletePhotos(photos);
    return sockets;
  }

  /** Creates the community spaces (one per category) that do not exist yet. */
  async ensureCommunity(company: string) {
    for (const section of COMMUNITY_SECTIONS) {
      if (await this.get(section.id)) continue;
      // The first space was "Comunidade <company>" before there were categories.
      const name = section.path === '/' ? `Comunidade ${company}` : `${section.label} · Comunidade ${company}`;
      const state = createRoomState(section.id, name, Date.now(), null, { kind: section.kind, global: true });
      await this.storage.save(section.id, { v: 1, seq: 0, state, secrets: {}, lastSeen: {} });
    }
  }

  /** Whether `userId` is a member of the room and `secret` is theirs (for requests outside the socket). */
  isMember(room: LiveRoom, userId: string, secret: string): boolean {
    const known = room.doc.secrets[userId];
    if (!known || !room.doc.state.members[userId]) return false;
    const hash = sha256(secret);
    return known.length === hash.length && timingSafeEqual(Buffer.from(known), Buffer.from(hash));
  }

  /** Rooms any colleague can find on the home page: the busiest first. */
  async communityRooms(limit = 100): Promise<CommunityRoom[]> {
    if (!this.directory) {
      this.directoryLoading ??= this.storage
        .listedRooms()
        .then((rows) => {
          const map = new Map(rows.map((r) => [r.id, r]));
          // Rooms in memory may have changes that are not saved yet.
          for (const room of this.live.values()) {
            if (room.doc.state.listed) map.set(room.id, communitySummary(room.doc.state));
            else map.delete(room.id);
          }
          this.directory = map;
        })
        .finally(() => {
          this.directoryLoading = null;
        });
      await this.directoryLoading;
    }
    return [...this.directory!.values()]
      .map((r) => {
        const room = this.live.get(r.id);
        return { ...r, online: room ? this.onlineCount(room) : 0 };
      })
      .sort((a, b) => b.online - a.online || b.updatedAt - a.updatedAt)
      .slice(0, limit);
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

  /** The room's name when `userId` is a member of it and `secret` is theirs (null otherwise). */
  async memberRoomName(id: string, userId: string, secret: string): Promise<string | null> {
    const room = await this.get(id);
    const known = room?.doc.secrets[userId];
    if (!room || !known || !room.doc.state.members[userId]) return null;
    return timingSafeEqual(Buffer.from(known), Buffer.from(sha256(secret))) ? room.doc.state.name : null;
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
    if (room.deleted) return;
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
      if (!room.dirty || room.deleted) return;
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
