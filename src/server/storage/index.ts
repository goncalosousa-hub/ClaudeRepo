import { FileStorage } from './file';
import { PostgresStorage } from './postgres';
import type { Storage } from './types';

export type { RoomDoc, Storage } from './types';

export function createStorage(opts: { dataDir: string; databaseUrl?: string }): Storage {
  if (opts.databaseUrl) return new PostgresStorage(opts.databaseUrl);
  return new FileStorage(opts.dataDir);
}

/**
 * Copies the rooms saved as JSON files (in `dataDir`) into another storage, e.g. when switching to
 * PostgreSQL. Rooms that already exist there are left untouched. Returns how many were copied.
 */
export async function importFileRooms(dataDir: string, target: Storage): Promise<number> {
  const files = new FileStorage(dataDir);
  let imported = 0;
  for (const id of await files.list()) {
    if (await target.load(id)) continue;
    const doc = await files.load(id);
    if (!doc) continue;
    await target.save(id, doc);
    imported++;
  }
  return imported;
}
