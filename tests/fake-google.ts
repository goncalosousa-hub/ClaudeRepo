// A fake of Google's side of "Sign in with Google": an RSA key pair made when this module loads, its
// public half as a JWKS (what https://www.googleapis.com/oauth2/v3/certs serves) and ID tokens
// signed with it. The fake server (fake-tmdb.ts) serves both on /google/certs and /google/token.
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

export const FAKE_GOOGLE_CLIENT_ID = '1234-fake.apps.googleusercontent.com';
export const FAKE_GOOGLE_KID = 'fake-google-key-1';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export function googleCerts() {
  return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: FAKE_GOOGLE_KID, alg: 'RS256', use: 'sig' }] };
}

/** A colleague's ID token, as the Google button gives it; `claims` replace the defaults. */
export function googleToken(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: KeyObject } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'https://accounts.google.com',
    azp: FAKE_GOOGLE_CLIENT_ID,
    aud: FAKE_GOOGLE_CLIENT_ID,
    sub: '109876543210987654321',
    hd: 'lusiaves.pt',
    email: 'ana.sofia@lusiaves.pt',
    email_verified: true,
    name: 'Ana Sofia Pereira',
    given_name: 'Ana Sofia',
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const signed = `${part({ alg: 'RS256', kid: opts.kid ?? FAKE_GOOGLE_KID, typ: 'JWT' })}.${part(payload)}`;
  return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), opts.key ?? privateKey).toString('base64url')}`;
}

/** /google/certs → the keys; /google/token?sub=…&email=…&name=… → { token } (for the E2E tests). */
export function handleGoogle(url: URL): { status: number; body: unknown } {
  if (url.pathname === '/google/certs') return { status: 200, body: googleCerts() };
  if (url.pathname === '/google/token') {
    const claims: Record<string, unknown> = {};
    for (const field of ['sub', 'email', 'name', 'hd', 'aud']) {
      const value = url.searchParams.get(field);
      if (value !== null) claims[field] = value;
    }
    return { status: 200, body: { token: googleToken(claims) } };
  }
  return { status: 404, body: { error: 'not_found' } };
}
