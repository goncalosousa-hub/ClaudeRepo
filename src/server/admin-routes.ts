// The admins' page (/admin): what is in the community, and deleting people (test profiles, someone
// who asked to leave) and rooms. Only for the accounts in ADMINS, signed in with the same account
// check as the rest of the account API.
import express, { type Response } from 'express';
import type { Server } from 'socket.io';
import { COMMUNITY_SECTIONS, communitySection } from '../shared/constants';
import { ROOM_ID_RE } from '../shared/schema';
import { credentials } from './account-routes';
import { isAdminAccount, type AccountManager } from './accounts';
import { rateLimit } from './http';
import type { LiveRoom, RoomManager } from './rooms';
import type { AccountDoc, Storage } from './storage';

const USER_ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

/** What the overview says about how the server is set up (nothing secret). */
export interface AdminInfo {
  google: { domains: string[] } | null;
  communityCode: boolean;
  /** Only Google accounts get in (GOOGLE_ONLY) */
  googleOnly: boolean;
  tmdb: boolean;
  admins: string[];
  photosMaxBytes: number;
}

export interface AdminPerson {
  id: string;
  name: string;
  color: string;
  avatar: string;
  unit: string;
  /** Community spaces they are in */
  sections: string[];
  joinedAt: number | null;
  lastSeen: number | null;
  online: boolean;
  /** In the community: titles they added, opinions, photos and chat messages */
  titles: number;
  reviews: number;
  photos: number;
  messages: number;
  account: { username: string; google: string | null; createdAt: number; admin: boolean } | null;
}

export function adminRouter(opts: {
  accounts: AccountManager;
  rooms: RoomManager;
  storage: Storage;
  admins: ReadonlySet<string>;
  io: Server;
  info: AdminInfo;
}) {
  const { accounts, rooms, storage, admins, io, info } = opts;
  const router = express.Router();
  const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

  // Every admin request: a signed-in account named in ADMINS.
  router.use('/admin', rateLimit(300, 60_000), async (req, res, next) => {
    const c = credentials(req);
    const doc = c ? await accounts.authenticate(c.username, c.secret) : null;
    if (!doc) return fail(res, 401, 'unauthorized');
    if (!isAdminAccount(doc, admins)) return fail(res, 403, 'forbidden');
    res.locals.admin = doc;
    next();
  });

  const community = async () =>
    (await Promise.all(COMMUNITY_SECTIONS.map((s) => rooms.get(s.id)))).filter((r): r is LiveRoom => r !== null);

  router.get('/admin/overview', async (_req, res) => {
    const spaces = await community();
    const people = new Set<string>();
    const online = new Set<string>();
    const sections = spaces.map((room) => {
      const s = room.doc.state;
      for (const id of Object.keys(s.members)) people.add(id);
      for (const id of room.userSockets.keys()) online.add(id);
      return {
        id: room.id,
        members: Object.keys(s.members).length,
        titles: Object.keys(s.anime).length,
        reviews: Object.values(s.reviews).reduce((n, r) => n + Object.keys(r).length, 0),
        photos: Object.values(s.photos ?? {}).reduce((n, list) => n + list.length, 0),
        messages: s.chat.length,
        online: room.userSockets.size,
      };
    });
    const [docs, roomRows, photoBytes] = await Promise.all([accounts.all(), rooms.allRooms(), storage.photoBytes()]);
    res.json({
      sections,
      people: people.size,
      online: online.size,
      accounts: docs.length,
      googleAccounts: docs.filter((d) => d.google).length,
      rooms: roomRows.length,
      photoBytes,
      config: info,
    });
  });

  router.get('/admin/people', async (_req, res) => {
    const people = new Map<string, AdminPerson>();
    const person = (id: string, profile: { name: string; color: string; avatar: string; unit?: string }) => {
      let p = people.get(id);
      if (!p) {
        p = {
          id,
          name: profile.name,
          color: profile.color,
          avatar: profile.avatar,
          unit: profile.unit ?? '',
          sections: [],
          joinedAt: null,
          lastSeen: null,
          online: false,
          titles: 0,
          reviews: 0,
          photos: 0,
          messages: 0,
          account: null,
        };
        people.set(id, p);
      }
      return p;
    };
    for (const room of await community()) {
      const s = room.doc.state;
      for (const m of Object.values(s.members)) {
        const p = person(m.id, m);
        p.sections.push(room.id);
        p.joinedAt = Math.min(p.joinedAt ?? m.joinedAt, m.joinedAt);
        const seen = room.doc.lastSeen[m.id];
        if (seen) p.lastSeen = Math.max(p.lastSeen ?? 0, seen);
        if (room.userSockets.has(m.id)) p.online = true;
      }
      for (const a of Object.values(s.anime)) if (s.members[a.addedBy]) people.get(a.addedBy)!.titles++;
      for (const byMember of Object.values(s.reviews)) {
        for (const id of Object.keys(byMember)) if (s.members[id]) people.get(id)!.reviews++;
      }
      for (const list of Object.values(s.photos ?? {})) for (const photo of list) if (s.members[photo.by]) people.get(photo.by)!.photos++;
      for (const c of s.chat) if (s.members[c.by]) people.get(c.by)!.messages++;
    }
    // People with an account, also the ones who never came to the community; the account has
    // their current profile.
    for (const doc of await accounts.all()) {
      const p = person(doc.userId, doc.profile);
      Object.assign(p, { name: doc.profile.name, color: doc.profile.color, avatar: doc.profile.avatar, unit: doc.profile.unit ?? '' });
      p.account = { username: doc.username, google: doc.google?.email ?? null, createdAt: doc.createdAt, admin: isAdminAccount(doc, admins) };
    }
    const list = [...people.values()].sort(
      (a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? b.joinedAt ?? 0) - (a.lastSeen ?? a.joinedAt ?? 0),
    );
    res.json({ people: list, me: (res.locals.admin as AccountDoc).userId });
  });

  // Deletes someone: out of every room (with their opinions, photos, messages and the titles only
  // they cared about) and their account. If they open the app again, they come in as someone new.
  router.delete('/admin/people/:id', async (req, res) => {
    const id = String(req.params.id);
    const admin = res.locals.admin as AccountDoc;
    if (!USER_ID_RE.test(id)) return fail(res, 400, 'invalid_request');
    if (id === admin.userId) return fail(res, 400, 'cannot_delete_self');
    const owned = (await accounts.all()).filter((doc) => doc.userId === id);
    // Admins are named in ADMINS: taking away their account would only lock them out.
    if (owned.some((doc) => isAdminAccount(doc, admins))) return fail(res, 400, 'cannot_delete_admin');

    const removedFrom: string[] = [];
    for (const roomId of await rooms.roomsOf(id)) {
      const room = await rooms.get(roomId);
      if (!room?.doc.state.members[id]) continue;
      // Their open tabs are closed first, so nothing of theirs arrives after the removal.
      for (const socketId of [...(room.userSockets.get(id) ?? [])]) io.sockets.sockets.get(socketId)?.disconnect(true);
      const env = rooms.removeMember(room, id, admin.userId);
      if (!env) continue;
      io.to(room.id).emit('op', env);
      removedFrom.push(room.id);
    }
    const deleted: string[] = [];
    for (const doc of owned) if (await accounts.remove(doc.username)) deleted.push(doc.username);
    if (!removedFrom.length && !deleted.length) return fail(res, 404, 'not_found');
    res.json({ ok: true, rooms: removedFrom, accounts: deleted });
  });

  router.get('/admin/rooms', async (_req, res) => {
    res.json({ rooms: await rooms.allRooms() });
  });

  router.delete('/admin/rooms/:id', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!ROOM_ID_RE.test(id) || communitySection(id)) return fail(res, 400, 'invalid_request');
    const sockets = await rooms.deleteRoom(id);
    if (!sockets) return fail(res, 404, 'room_not_found');
    // Whoever was in it gets "room not found" when their browser reconnects.
    for (const socketId of sockets) io.sockets.sockets.get(socketId)?.disconnect(true);
    res.json({ ok: true });
  });

  return router;
}
