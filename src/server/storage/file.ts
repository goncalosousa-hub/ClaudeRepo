import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOM_ID_RE } from '../../shared/schema';
import type { RoomDoc, Storage } from './types';

/** One JSON file per room (default; no database needed). Writes are atomic (temp file + rename). */
export class FileStorage implements Storage {
  readonly kind = 'file';
  private dir: string;

  constructor(dataDir: string) {
    this.dir = path.resolve(dataDir, 'rooms');
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  private file(id: string) {
    if (!ROOM_ID_RE.test(id)) throw new Error(`invalid room id: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  async load(id: string): Promise<RoomDoc | null> {
    try {
      return JSON.parse(await readFile(this.file(id), 'utf8')) as RoomDoc;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(id: string, doc: RoomDoc) {
    const file = this.file(id);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc));
    await rename(tmp, file);
  }

  async close() {}

  get location() {
    return this.dir;
  }
}
