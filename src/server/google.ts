// Sign in with Google. The Google button (in the browser) gives an ID token: a JWT signed by Google
// that says who the person is. The server checks the signature with Google's public keys and the
// claims (made for this app, by Google, not expired, verified email). With GOOGLE_DOMAIN only the
// accounts of the company's Google Workspace get in: Google puts that domain in the "hd" claim, and
// only there is Google the one who vouches for the email.
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Clocks are never exactly in sync. */
const SKEW_S = 300;
/** Keys are fetched again at most this often (a token with an unknown key must not make us hammer Google). */
const REFETCH_MS = 60_000;
/** Google's account ids: at most 255 ASCII characters (in practice 21 digits). */
const SUB_RE = /^[A-Za-z0-9_-]{1,255}$/;

export interface GoogleOptions {
  /** OAuth client id of the app (Google Cloud → Google Auth Platform → Clients). Off without it. */
  clientId?: string;
  /** Only accounts of these Google Workspace domains can sign in (e.g. ["lusiaves.pt"]). */
  domains?: string[];
  /** For tests: another server with the public keys (JWKS) */
  certsUrl?: string;
}

/** Who signed in, as Google says. */
export interface GoogleIdentity {
  /** Google's id of the account: it never changes, the email can */
  sub: string;
  email: string;
  name: string;
}

export type GoogleErrorCode = 'google_off' | 'invalid_token' | 'wrong_domain' | 'google_unreachable';

export class GoogleError extends Error {
  constructor(readonly code: GoogleErrorCode) {
    super(code);
    this.name = 'GoogleError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

function decodePart(part: string): Json {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export class GoogleAuth {
  readonly clientId: string | null;
  readonly domains: string[];
  private readonly certsUrl: string;
  private keys = new Map<string, KeyObject>();
  private expires = 0;
  private fetchedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(opts: GoogleOptions = {}) {
    this.clientId = opts.clientId?.trim() || null;
    this.domains = [...new Set((opts.domains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
    this.certsUrl = opts.certsUrl ?? CERTS_URL;
  }

  get enabled() {
    return this.clientId !== null;
  }

  /** What the browser needs to show the button (none of it is secret). */
  get publicConfig() {
    return this.clientId ? { clientId: this.clientId, domains: this.domains } : null;
  }

  private async loadKeys() {
    this.fetchedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(this.certsUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new GoogleError('google_unreachable');
    }
    const data: Json = res.ok ? await res.json().catch(() => null) : null;
    const keys = new Map<string, KeyObject>();
    for (const jwk of Array.isArray(data?.keys) ? data.keys : []) {
      if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string') continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
      } catch {
        /* not a usable key */
      }
    }
    if (!keys.size) throw new GoogleError('google_unreachable');
    this.keys = keys;
    // Google says how long to keep them (Cache-Control: max-age, a few hours).
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1]);
    this.expires = Date.now() + (maxAge > 0 ? Math.min(maxAge, 86_400) : 3600) * 1000;
  }

  /** Google's public key with this id; the keys are fetched again when they are old or a new one shows up. */
  private async key(kid: string): Promise<KeyObject | null> {
    const now = Date.now();
    const due = now >= this.expires || !this.keys.has(kid);
    // Without any key (Google unreachable so far) a new try every few seconds, else once a minute.
    if (due && now - this.fetchedAt >= (this.keys.size ? REFETCH_MS : 5_000)) {
      this.loading ??= this.loadKeys().finally(() => {
        this.loading = null;
      });
    }
    // When Google cannot be reached the keys we have stay good (they are valid for days).
    if (this.loading) await this.loading.catch(() => {});
    if (!this.keys.size) throw new GoogleError('google_unreachable');
    return this.keys.get(kid) ?? null;
  }

  /** Checks an ID token from the Google button and says whose it is. */
  async verify(token: string): Promise<GoogleIdentity> {
    if (!this.clientId) throw new GoogleError('google_off');
    const invalid = new GoogleError('invalid_token');
    const parts = token.split('.');
    if (parts.length !== 3) throw invalid;
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') throw invalid;
    const key = await this.key(header.kid);
    const signature = Buffer.from(parts[2], 'base64url');
    if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, signature)) throw invalid;

    const now = Date.now() / 1000;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !ISSUERS.has(claims.iss) ||
      !audience.includes(this.clientId) ||
      typeof claims.exp !== 'number' ||
      claims.exp + SKEW_S < now ||
      (typeof claims.iat === 'number' && claims.iat - SKEW_S > now) ||
      typeof claims.sub !== 'string' ||
      !SUB_RE.test(claims.sub) ||
      typeof claims.email !== 'string' ||
      !claims.email.includes('@') ||
      (claims.email_verified !== true && claims.email_verified !== 'true')
    ) {
      throw invalid;
    }
    const hd = typeof claims.hd === 'string' ? claims.hd.toLowerCase() : '';
    if (this.domains.length && !this.domains.includes(hd)) throw new GoogleError('wrong_domain');
    const email = claims.email.trim().toLowerCase().slice(0, 254);
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : email.split('@')[0];
    return { sub: claims.sub, email, name: name.slice(0, 200) };
  }
}
