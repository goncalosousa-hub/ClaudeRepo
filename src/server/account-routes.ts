import express, { type Request, type Response } from 'express';
import { communitySection } from '../shared/constants';
import {
  googleLinkSchema,
  googleLoginSchema,
  loginSchema,
  passwordChangeSchema,
  profileSchema,
  registerSchema,
  roomIdSchema,
  usernameSchema,
} from '../shared/schema';
import { isAdminAccount, loginResult, roomList, type AccountManager } from './accounts';
import type { CommunityGate } from './community';
import { GoogleError, type GoogleAuth, type GoogleIdentity } from './google';
import { rateLimit } from './http';
import type { RoomManager } from './rooms';
import type { AccountDoc } from './storage';

/** Browsers authenticate account requests with `Authorization: Account <username>:<secret>`. */
export function credentials(req: Request): { username: string; secret: string } | null {
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

const GOOGLE_STATUS: Record<GoogleError['code'], number> = {
  google_off: 404,
  invalid_token: 401,
  wrong_domain: 403,
  google_unreachable: 502,
};

export function accountRouter(
  accounts: AccountManager,
  rooms: RoomManager,
  google: GoogleAuth,
  gate: CommunityGate,
  admins: ReadonlySet<string> = new Set(),
) {
  const router = express.Router();
  const failed = new FailedLogins(10, 15 * 60_000);
  const unauthorized = (res: Response) => res.status(401).json({ error: 'unauthorized' });

  // A Google account opens the app behind the code only when it has to be one of the company
  // (GOOGLE_DOMAIN), and always with GOOGLE_ONLY (where Google is the only way in).
  const opensGate = () => google.domains.length > 0 || gate.googleOnly;

  /** Whose the Google token is; on failure the error is sent and the result is null. */
  const googleIdentity = async (credential: string, res: Response): Promise<GoogleIdentity | null> => {
    try {
      return await google.verify(credential);
    } catch (err) {
      if (!(err instanceof GoogleError)) throw err;
      res.status(GOOGLE_STATUS[err.code]).json({ error: err.code });
      return null;
    }
  };

  /**
   * The rooms an identity was already in (from the browser's history) start "As tuas salas" of its new
   * account; only rooms where it really is a member count.
   */
  const addVisitedRooms = async (doc: AccountDoc, identity: { id: string; secret: string }, visited: { id: string; visitedAt: number }[]) => {
    const visits = [];
    for (const r of visited.filter((room) => !communitySection(room.id))) {
      const roomName = await rooms.memberRoomName(r.id, identity.id, identity.secret);
      if (roomName !== null) visits.push({ id: r.id, name: roomName, visitedAt: r.visitedAt });
    }
    if (!visits.length) return doc;
    return (await accounts.recordVisits(doc.username, identity.id, identity.secret, visits)) ?? doc;
  };

  router.use('/account', rateLimit(300, 60_000));

  const authed = async (req: Request) => {
    const c = credentials(req);
    return c ? { ...c, doc: await accounts.authenticate(c.username, c.secret) } : null;
  };

  // With GOOGLE_ONLY accounts are made and used with Google only.
  const googleOnly = (res: Response) => {
    if (!gate.googleOnly) return false;
    res.status(403).json({ error: 'google_only' });
    return true;
  };

  router.post('/auth/register', rateLimit(60, 60 * 60_000), async (req, res) => {
    if (googleOnly(res)) return;
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const error = field === 'username' ? 'invalid_username' : field === 'password' ? 'invalid_password' : 'invalid_request';
      res.status(400).json({ error });
      return;
    }
    const { username, password, name, color, avatar, unit, id, secret } = parsed.data;
    const identity = id && secret ? { id, secret } : undefined;
    let doc = await accounts.register(username, password, { name, color, avatar, unit }, identity);
    if (!doc) {
      res.status(409).json({ error: 'username_taken' });
      return;
    }
    if (identity && parsed.data.rooms?.length) doc = await addVisitedRooms(doc, identity, parsed.data.rooms);
    res.status(201).json(loginResult(doc));
  });

  // Whether "Continuar com Google" is on, for which Google Workspace domains, and whether it is the
  // only way in (open to everyone).
  router.get('/auth/providers', (_req, res) => {
    res.json({ google: google.publicConfig && { ...google.publicConfig, only: gate.googleOnly } });
  });

  // Sign in with the ID token from the Google button: to the linked account, or a new one. Behind the
  // community code, a Google account of the company (GOOGLE_DOMAIN) opens the app as the code does.
  // A generous limit: a whole office signs in from one IP, and only real Google tokens get anywhere.
  router.post('/auth/google', rateLimit(300, 10 * 60_000), async (req, res) => {
    const locked = !gate.allows(req.headers.cookie);
    if (locked && !opensGate()) {
      res.status(401).json({ error: 'community_locked' });
      return;
    }
    const parsed = googleLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const who = await googleIdentity(parsed.data.credential, res);
    if (!who) return;
    const { profile, id, secret } = parsed.data;
    const identity = id && secret ? { id, secret } : undefined;
    const result = await accounts.googleLogin(who, { profile, identity });
    if (!result) {
      res.status(500).json({ error: 'server_error' });
      return;
    }
    let doc = result.doc;
    if (result.created && identity && parsed.data.rooms?.length) doc = await addVisitedRooms(doc, identity, parsed.data.rooms);
    if (locked) res.setHeader('Set-Cookie', gate.cookie(req.secure));
    res.status(result.created ? 201 : 200).json({ ...loginResult(doc), created: result.created });
  });

  router.post('/auth/login', rateLimit(200, 10 * 60_000), async (req, res) => {
    if (googleOnly(res)) return;
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
    res.json({
      username: a.doc.username,
      profile: a.doc.profile,
      rooms: roomList(a.doc),
      google: a.doc.google?.email ?? null,
      password: !!a.doc.password,
      admin: isAdminAccount(a.doc, admins),
    });
  });

  // Links a Google account to the signed-in account: from then on either signs in. It works before
  // getting in (like signing in with Google), so an account made with a password can move to Google.
  router.post('/account/google', rateLimit(30, 10 * 60_000), async (req, res) => {
    const c = credentials(req);
    const parsed = googleLinkSchema.safeParse(req.body);
    const locked = !gate.allows(req.headers.cookie);
    if (locked && !opensGate()) {
      res.status(401).json({ error: 'community_locked' });
      return;
    }
    if (!c) return void unauthorized(res);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const who = await googleIdentity(parsed.data.credential, res);
    if (!who) return;
    const result = await accounts.linkGoogle(c.username, c.secret, who);
    if (result === null) return void unauthorized(res);
    if (result === 'taken' || result === 'linked') {
      res.status(409).json({ error: result === 'taken' ? 'google_taken' : 'google_linked' });
      return;
    }
    if (locked) res.setHeader('Set-Cookie', gate.cookie(req.secure));
    res.json({ ok: true, google: who.email });
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
    if (googleOnly(res)) return;
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
