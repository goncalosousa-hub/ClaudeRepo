import express, { type Request, type Response } from 'express';
import { loginSchema, passwordChangeSchema, profileSchema, registerSchema, roomIdSchema, usernameSchema } from '../shared/schema';
import { loginResult, roomList, type AccountManager } from './accounts';
import { rateLimit } from './http';
import type { RoomManager } from './rooms';

/** Browsers authenticate account requests with `Authorization: Account <username>:<secret>`. */
function credentials(req: Request): { username: string; secret: string } | null {
  const m = (req.get('authorization') ?? '').match(/^Account ([^:\s]+):(\S+)$/);
  if (!m) return null;
  const username = usernameSchema.safeParse(m[1]);
  return username.success ? { username: username.data, secret: m[2] } : null;
}

/**
 * Wrong passwords are limited per username and IP: guessing one person's password is slow, and a
 * stranger spamming wrong passwords does not lock that person out on their own network.
 */
class FailedLogins {
  private failures = new Map<string, { count: number; until: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  private key = (username: string, req: Request) => `${username}|${req.ip ?? 'unknown'}`;
  blocked(username: string, req: Request) {
    const f = this.failures.get(this.key(username, req));
    return !!f && f.until > Date.now() && f.count >= this.max;
  }
  fail(username: string, req: Request) {
    const now = Date.now();
    const key = this.key(username, req);
    const f = this.failures.get(key);
    if (!f || f.until < now) this.failures.set(key, { count: 1, until: now + this.windowMs });
    else f.count++;
    if (this.failures.size > 10_000) for (const [k, v] of this.failures) if (v.until < now) this.failures.delete(k);
  }
  reset(username: string, req: Request) {
    this.failures.delete(this.key(username, req));
  }
}

export function accountRouter(accounts: AccountManager, rooms: RoomManager) {
  const router = express.Router();
  const failed = new FailedLogins(10, 15 * 60_000);
  const unauthorized = (res: Response) => res.status(401).json({ error: 'unauthorized' });

  router.use('/account', rateLimit(300, 60_000));

  const authed = async (req: Request) => {
    const c = credentials(req);
    return c ? { ...c, doc: await accounts.authenticate(c.username, c.secret) } : null;
  };

  router.post('/auth/register', rateLimit(60, 60 * 60_000), async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const error = field === 'username' ? 'invalid_username' : field === 'password' ? 'invalid_password' : 'invalid_request';
      res.status(400).json({ error });
      return;
    }
    const { username, password, name, color, avatar, id, secret } = parsed.data;
    const identity = id && secret ? { id, secret } : undefined;
    let doc = await accounts.register(username, password, { name, color, avatar }, identity);
    if (!doc) {
      res.status(409).json({ error: 'username_taken' });
      return;
    }
    // The rooms this identity was already in (from the browser's history) start "As tuas salas";
    // only rooms where it really is a member count.
    if (identity && parsed.data.rooms?.length) {
      const visits = [];
      for (const r of parsed.data.rooms) {
        const roomName = await rooms.memberRoomName(r.id, identity.id, identity.secret);
        if (roomName !== null) visits.push({ id: r.id, name: roomName, visitedAt: r.visitedAt });
      }
      if (visits.length) doc = (await accounts.recordVisits(username, identity.id, identity.secret, visits)) ?? doc;
    }
    res.status(201).json(loginResult(doc));
  });

  router.post('/auth/login', rateLimit(200, 10 * 60_000), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    const { username, password } = parsed.data;
    if (failed.blocked(username, req)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    const doc = await accounts.login(username, password);
    if (!doc) {
      failed.fail(username, req);
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    failed.reset(username, req);
    res.json(loginResult(doc));
  });

  router.get('/account', async (req, res) => {
    const a = await authed(req);
    if (!a?.doc) return void unauthorized(res);
    res.json({ username: a.doc.username, profile: a.doc.profile, rooms: roomList(a.doc) });
  });

  router.patch('/account', async (req, res) => {
    const c = credentials(req);
    const parsed = profileSchema.safeParse(req.body);
    if (!c) return void unauthorized(res);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const doc = await accounts.updateProfile(c.username, c.secret, parsed.data);
    if (!doc) return void unauthorized(res);
    res.json({ ok: true });
  });

  router.post('/account/password', async (req, res) => {
    const c = credentials(req);
    const parsed = passwordChangeSchema.safeParse(req.body);
    if (!c) return void unauthorized(res);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_password' });
      return;
    }
    if (failed.blocked(c.username, req)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    const ok = await accounts.changePassword(c.username, c.secret, parsed.data.current, parsed.data.next);
    if (ok === null) return void unauthorized(res);
    if (!ok) {
      failed.fail(c.username, req);
      res.status(403).json({ error: 'wrong_password' });
      return;
    }
    res.json({ ok: true });
  });

  router.delete('/account/rooms/:id', async (req, res) => {
    const c = credentials(req);
    const id = roomIdSchema.safeParse(req.params.id);
    if (!c) return void unauthorized(res);
    if (!id.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const doc = await accounts.forgetRoom(c.username, c.secret, id.data);
    if (!doc) return void unauthorized(res);
    res.json({ ok: true });
  });

  return router;
}
