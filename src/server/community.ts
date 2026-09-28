// Colleagues only: with COMMUNITY_CODE set, the API and the live connections need that code once
// per browser. The page itself loads for anyone and asks for the code.
import { createHash, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from './http';

export const ACCESS_COOKIE = 'atl_access';
const OPEN_PATHS = new Set(['/health', '/community/status', '/community/unlock']);

const digest = (code: string) => createHash('sha256').update(`lusiaves-tierlist:${code.trim()}`).digest('base64url');

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export class CommunityGate {
  /** What the access cookie holds: a hash of the code, so changing the code signs everyone out. */
  private readonly token: string | null;

  constructor(code?: string) {
    this.token = code?.trim() ? digest(code) : null;
  }

  get enabled() {
    return this.token !== null;
  }

  /** Whether a request (its Cookie header) may use the app. */
  allows(cookieHeader: string | undefined) {
    if (!this.token) return true;
    const value = readCookie(cookieHeader, ACCESS_COOKIE);
    return value !== null && sameText(value, this.token);
  }

  check(code: string) {
    return this.token !== null && sameText(digest(code), this.token);
  }

  cookie(secure: boolean) {
    return `${ACCESS_COOKIE}=${this.token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  }

  /** Blocks the API without the access cookie (health check and unlocking stay open). */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (OPEN_PATHS.has(req.path) || this.allows(req.headers.cookie)) return next();
      res.status(401).json({ error: 'community_locked' });
    };
  }

  router() {
    const router = express.Router();
    router.get('/community/status', (req, res) => {
      res.json({ required: this.enabled, unlocked: this.allows(req.headers.cookie) });
    });
    router.post('/community/unlock', rateLimit(20, 15 * 60_000), (req, res) => {
      const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 200) : '';
      if (!this.enabled) return void res.json({ ok: true });
      if (!this.check(code)) return void res.status(401).json({ error: 'wrong_code' });
      res.setHeader('Set-Cookie', this.cookie(req.secure));
      res.json({ ok: true });
    });
    return router;
  }
}
