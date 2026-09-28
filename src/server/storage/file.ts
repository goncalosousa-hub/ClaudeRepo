import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { USERNAME_RE } from '../../shared/constants';
import { ROOM_ID_RE } from '../../shared/schema';
import type { AccountDoc, RoomDoc, Storage } from './types';

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

  constructor(dataDir: string) {
    this.dir = path.resolve(dataDir, 'rooms');
    this.accountsDir = path.resolve(dataDir, 'accounts');
  }

  get label() {
    return `ficheiros JSON em ${path.dirname(this.dir)}`;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.accountsDir, { recursive: true });
  }

  private file(id: string) {
    if (!ROOM_ID_RE.test(id)) throw new Error(`invalid room id: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  private accountFile(username: string) {
    if (!USERNAME_RE.test(username)) throw new Error(`invalid username: ${username}`);
    return path.join(this.accountsDir, `${username}.json`);
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

  async close() {}
}
