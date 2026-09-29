import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PHOTO_ID_RE, USERNAME_RE } from '../../shared/constants';
import { communitySummary } from '../../shared/media';
import { ROOM_ID_RE } from '../../shared/schema';
import type { CommunityRoom } from '../../shared/types';
import type { AccountDoc, RoomDoc, RoomRow, Storage, StoredPhoto } from './types';

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Atomic write: a crash never leaves a half-written file behind. */
async function writeJson(file: string, value: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

async function listIds(dir: string, re: RegExp): Promise<string[]> {
  try {
    return (await readdir(dir))
      .map((f) => (f.endsWith('.json') ? f.slice(0, -5) : ''))
      .filter((id) => re.test(id));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** One JSON file per room / account (default; no database needed). */
export class FileStorage implements Storage {
  readonly kind = 'file';
  private dir: string;
  private accountsDir: string;
  private googleDir: string;
  private photosDir: string;

  private settingsFile: string;

  constructor(dataDir: string) {
    this.settingsFile = path.resolve(dataDir, 'settings.json');
    this.dir = path.resolve(dataDir, 'rooms');
    this.accountsDir = path.resolve(dataDir, 'accounts');
    this.googleDir = path.resolve(dataDir, 'google');
    this.photosDir = path.resolve(dataDir, 'photos');
  }

  get label() {
    return `ficheiros JSON em ${path.dirname(this.dir)}`;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.accountsDir, { recursive: true });
    await mkdir(this.googleDir, { recursive: true });
    await mkdir(this.photosDir, { recursive: true });
  }

  private photoFile(id: string, thumb: boolean) {
    if (!PHOTO_ID_RE.test(id)) throw new Error(`invalid photo id: ${id}`);
    return path.join(this.photosDir, thumb ? `${id}.thumb.jpg` : `${id}.jpg`);
  }

  private file(id: string) {
    if (!ROOM_ID_RE.test(id)) throw new Error(`invalid room id: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  private accountFile(username: string) {
    if (!USERNAME_RE.test(username)) throw new Error(`invalid username: ${username}`);
    return path.join(this.accountsDir, `${username}.json`);
  }

  /** Google's ids are case-sensitive and can be long; file names may be neither. */
  private googleFile(sub: string) {
    return path.join(this.googleDir, `${createHash('sha256').update(sub).digest('hex')}.json`);
  }

  /** Ids of all rooms saved in the folder. */
  list(): Promise<string[]> {
    return listIds(this.dir, ROOM_ID_RE);
  }

  listAccounts(): Promise<string[]> {
    return listIds(this.accountsDir, USERNAME_RE);
  }

  async load(id: string) {
    return readJson<RoomDoc>(this.file(id));
  }

  async save(id: string, doc: RoomDoc) {
    return writeJson(this.file(id), doc);
  }

  async listedRooms(): Promise<Omit<CommunityRoom, 'online'>[]> {
    const out: Omit<CommunityRoom, 'online'>[] = [];
    for (const id of await this.list()) {
      const doc = await this.load(id).catch(() => null);
      if (!doc?.state.listed) continue;
      const saved = await stat(this.file(id)).then((s) => s.mtimeMs, () => 0);
      const summary = communitySummary(doc.state);
      out.push({ ...summary, updatedAt: Math.max(summary.updatedAt, Math.round(saved)) });
    }
    return out;
  }

  async allRooms(): Promise<RoomRow[]> {
    const out: RoomRow[] = [];
    for (const id of await this.list()) {
      const doc = await this.load(id).catch(() => null);
      if (!doc || doc.state.global) continue;
      const saved = await stat(this.file(id)).then((s) => s.mtimeMs, () => 0);
      const summary = communitySummary(doc.state);
      out.push({
        ...summary,
        listed: !!doc.state.listed,
        createdAt: doc.state.createdAt,
        updatedAt: Math.max(summary.updatedAt, Math.round(saved)),
      });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async roomsWithMember(userId: string) {
    const ids: string[] = [];
    for (const id of await this.list()) {
      const doc = await this.load(id).catch(() => null);
      if (doc?.state.members[userId]) ids.push(id);
    }
    return ids;
  }

  async deleteRoom(id: string) {
    await rm(this.file(id), { force: true });
  }

  async loadAccount(username: string) {
    return readJson<AccountDoc>(this.accountFile(username));
  }

  async createAccount(doc: AccountDoc) {
    await mkdir(this.accountsDir, { recursive: true });
    try {
      // "wx": fails if the file exists, so two people can never get the same username.
      await writeFile(this.accountFile(doc.username), JSON.stringify(doc), { flag: 'wx' });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  async saveAccount(doc: AccountDoc) {
    return writeJson(this.accountFile(doc.username), doc);
  }

  async allAccounts() {
    const docs: AccountDoc[] = [];
    for (const username of await this.listAccounts()) {
      const doc = await this.loadAccount(username).catch(() => null);
      if (doc) docs.push(doc);
    }
    return docs;
  }

  async deleteAccount(username: string) {
    await rm(this.accountFile(username), { force: true });
  }

  async unlinkGoogle(sub: string) {
    await rm(this.googleFile(sub), { force: true });
  }

  async googleAccount(sub: string) {
    const link = await readJson<{ sub: string; username: string }>(this.googleFile(sub));
    return link?.sub === sub ? link.username : null;
  }

  async linkGoogle(sub: string, username: string) {
    await mkdir(this.googleDir, { recursive: true });
    try {
      // "wx", as for accounts: a Google account never signs in to two accounts.
      await writeFile(this.googleFile(sub), JSON.stringify({ sub, username }), { flag: 'wx' });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  }

  async setting(key: string, create: () => string) {
    const settings = (await readJson<Record<string, string>>(this.settingsFile)) ?? {};
    if (typeof settings[key] === 'string') return settings[key];
    settings[key] = create();
    await mkdir(path.dirname(this.settingsFile), { recursive: true });
    await writeJson(this.settingsFile, settings);
    return settings[key];
  }

  async savePhoto(photo: StoredPhoto) {
    await mkdir(this.photosDir, { recursive: true });
    await writeFile(this.photoFile(photo.id, true), photo.thumb);
    await writeFile(this.photoFile(photo.id, false), photo.data);
  }

  async loadPhoto(id: string, thumb: boolean) {
    if (!PHOTO_ID_RE.test(id)) return null;
    try {
      return await readFile(this.photoFile(id, thumb));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async deletePhotos(ids: string[]) {
    for (const id of ids.filter((i) => PHOTO_ID_RE.test(i))) {
      await rm(this.photoFile(id, false), { force: true });
      await rm(this.photoFile(id, true), { force: true });
    }
  }

  async photoBytes() {
    let total = 0;
    let files: string[] = [];
    try {
      files = await readdir(this.photosDir);
    } catch {
      return 0;
    }
    for (const f of files) if (f.endsWith('.jpg')) total += await stat(path.join(this.photosDir, f)).then((s) => s.size, () => 0);
    return total;
  }

  async close() {}
}
