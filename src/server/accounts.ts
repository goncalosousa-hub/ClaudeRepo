import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { nanoid } from 'nanoid';
import { LIMITS, MEMBER_COLORS, isValidUsername } from '../shared/constants';
import type { GoogleIdentity } from './google';
import type { AccountDoc, Storage } from './storage';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const MAX_ROOMS = 200;
/** Reconnecting to the same room within this time does not rewrite the account. */
const REVISIT_MS = 60_000;

/** Passwords are stored as "scrypt$N$r$p$salt$hash", never in clear text. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

/** Compares secrets in constant time, whatever their length. */
function sameSecret(a: string, b: string) {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export interface Profile {
  name: string;
  color: string;
  avatar: string;
  unit?: string;
}

export interface AccountRoom {
  id: string;
  name: string;
  visitedAt: number;
}

/**
 * Usernames to try for a new Google account, from its email: "ana.sofia@lusiaves.pt" → "ana.sofia",
 * then "ana.sofia2", "ana.sofia3"… when taken.
 */
export function googleUsernames(email: string): string[] {
  let base = (email.split('@')[0] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '')
    .slice(0, 20)
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (!isValidUsername(base)) base = 'colega';
  const names = [base];
  for (let n = 2; n <= 30; n++) names.push(`${base}${n}`);
  for (let i = 0; i < 5; i++) names.push(`${base}${Math.floor(1000 + Math.random() * 9000)}`);
  return names.filter(isValidUsername);
}

/** What the browser keeps: the identity used in rooms + the account it belongs to. */
export function loginResult(doc: AccountDoc) {
  return {
    username: doc.username,
    user: { id: doc.userId, secret: doc.secret, ...doc.profile, account: doc.username },
    rooms: roomList(doc),
  };
}

export function roomList(doc: AccountDoc): AccountRoom[] {
  return Object.entries(doc.rooms)
    .map(([id, r]) => ({ id, name: r.name, visitedAt: r.visitedAt }))
    .sort((a, b) => b.visitedAt - a.visitedAt);
}

/**
 * Accounts: a username + password that gives back the same identity (user id + secret) on any
 * link or device, plus the list of rooms the person has been in.
 */
export class AccountManager {
  /** Changes to the same account are applied one at a time. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(private storage: Storage) {}

  private serialize<T>(username: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(username) ?? Promise.resolve();
    const next = previous.then(task, task);
    const done = next.catch(() => {});
    this.queues.set(username, done);
    void done.then(() => {
      if (this.queues.get(username) === done) this.queues.delete(username);
    });
    return next;
  }

  /**
   * Creates an account. When `identity` is given (the profile the person already uses), the account
   * keeps it, so their place in existing rooms stays theirs. Returns null when the username is taken.
   */
  async register(
    username: string,
    password: string,
    profile: Profile,
    identity?: { id: string; secret: string },
  ): Promise<AccountDoc | null> {
    const doc: AccountDoc = {
      v: 1,
      username,
      userId: identity?.id ?? `u_${nanoid(14)}`,
      secret: identity?.secret ?? nanoid(32),
      password: await hashPassword(password),
      profile,
      rooms: {},
      createdAt: Date.now(),
    };
    return (await this.storage.createAccount(doc)) ? doc : null;
  }

  async login(username: string, password: string): Promise<AccountDoc | null> {
    const doc = await this.storage.loadAccount(username);
    if (!doc?.password) {
      // Same amount of work as a real check, so response times do not reveal which usernames exist
      // (or which accounts only sign in with Google).
      await hashPassword(password);
      return null;
    }
    return (await verifyPassword(password, doc.password)) ? doc : null;
  }

  /**
   * Signs in with Google: to the account linked to that Google account, or to a new one. A new account
   * keeps `current` (the profile and identity this browser already uses), like `register`.
   */
  googleLogin(
    google: GoogleIdentity,
    current: { profile?: Partial<Profile>; identity?: { id: string; secret: string } } = {},
  ): Promise<{ doc: AccountDoc; created: boolean } | null> {
    return this.serialize(`google:${google.sub}`, async () => {
      const linked = await this.storage.googleAccount(google.sub);
      if (linked) {
        const doc = await this.storage.loadAccount(linked);
        if (!doc) return null;
        // The email can change in Google (e.g. a new surname); keep the one shown in the app current.
        if (doc.google?.email === google.email) return { doc, created: false };
        const updated = await this.update(linked, doc.secret, (d) => {
          d.google = { sub: google.sub, email: google.email };
        });
        return { doc: updated ?? doc, created: false };
      }
      const p = current.profile ?? {};
      const profile: Profile = {
        name: p.name?.trim() || google.name.slice(0, LIMITS.memberName).trim(),
        color: p.color ?? MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
        avatar: p.avatar ?? '',
        unit: p.unit ?? '',
      };
      for (const username of googleUsernames(google.email)) {
        const doc: AccountDoc = {
          v: 1,
          username,
          userId: current.identity?.id ?? `u_${nanoid(14)}`,
          secret: current.identity?.secret ?? nanoid(32),
          password: '',
          profile,
          rooms: {},
          createdAt: Date.now(),
          google: { sub: google.sub, email: google.email },
        };
        if (!(await this.storage.createAccount(doc))) continue;
        // Only another server could have linked it meanwhile (this one takes them one at a time).
        return (await this.storage.linkGoogle(google.sub, username)) ? { doc, created: true } : null;
      }
      return null;
    });
  }

  /**
   * Links a Google account to an account (signed in with username and password), so either signs in.
   * "taken" when that Google account signs in to another account, "linked" when this account already
   * has another Google account.
   */
  linkGoogle(username: string, secret: string, google: GoogleIdentity): Promise<AccountDoc | 'taken' | 'linked' | null> {
    return this.serialize(`google:${google.sub}`, async () => {
      const doc = await this.authenticate(username, secret);
      if (!doc) return null;
      if (doc.google) return doc.google.sub === google.sub ? doc : 'linked';
      const owner = await this.storage.googleAccount(google.sub);
      if (owner ? owner !== username : !(await this.storage.linkGoogle(google.sub, username))) return 'taken';
      return this.update(username, secret, (d) => {
        d.google = { sub: google.sub, email: google.email };
      });
    });
  }

  /** The account whose username + secret were sent by the browser (Authorization header). */
  async authenticate(username: string, secret: string): Promise<AccountDoc | null> {
    const doc = await this.storage.loadAccount(username);
    return doc && sameSecret(doc.secret, secret) ? doc : null;
  }

  /** Applies a change to an authenticated account; `change` returns false to skip saving. */
  private update(username: string, secret: string, change: (doc: AccountDoc) => boolean | void | Promise<boolean | void>) {
    return this.serialize(username, async () => {
      const doc = await this.authenticate(username, secret);
      if (!doc) return null;
      if ((await change(doc)) === false) return doc;
      await this.storage.saveAccount(doc);
      return doc;
    });
  }

  updateProfile(username: string, secret: string, profile: Profile) {
    return this.update(username, secret, (doc) => {
      doc.profile = profile;
    });
  }

  /** Returns false when the current password is wrong, null when the account is not valid. */
  async changePassword(username: string, secret: string, current: string, next: string): Promise<boolean | null> {
    let ok = true;
    const doc = await this.update(username, secret, async (d) => {
      if (!(await verifyPassword(current, d.password))) {
        ok = false;
        return false;
      }
      d.password = await hashPassword(next);
    });
    return doc ? ok : null;
  }

  forgetRoom(username: string, secret: string, roomId: string) {
    return this.update(username, secret, (doc) => {
      delete doc.rooms[roomId];
    });
  }

  /**
   * Remembers rooms in "As tuas salas" (when the account's identity enters a room, or rooms it had
   * been in before the account existed). Only the account's own identity counts.
   */
  recordVisits(username: string, userId: string, secret: string, visits: { id: string; name: string; visitedAt?: number }[]) {
    return this.serialize(username, async () => {
      const doc = await this.storage.loadAccount(username);
      if (!doc || doc.userId !== userId || !sameSecret(doc.secret, secret)) return null;
      const now = Date.now();
      let changed = false;
      for (const v of visits) {
        const visitedAt = Math.min(v.visitedAt ?? now, now);
        const known = doc.rooms[v.id];
        if (known && (known.visitedAt > visitedAt || (known.name === v.name && visitedAt - known.visitedAt < REVISIT_MS))) continue;
        doc.rooms[v.id] = { name: v.name, visitedAt };
        changed = true;
      }
      if (!changed) return doc;
      if (Object.keys(doc.rooms).length > MAX_ROOMS) {
        for (const r of roomList(doc).slice(MAX_ROOMS)) delete doc.rooms[r.id];
      }
      await this.storage.saveAccount(doc);
      return doc;
    });
  }
}
