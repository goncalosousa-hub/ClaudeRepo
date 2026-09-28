import { FileStorage } from './file';
import { PostgresStorage } from './postgres';
import type { Storage } from './types';

export type { RoomDoc, Storage } from './types';

export function createStorage(opts: { dataDir: string; databaseUrl?: string }): Storage {
  if (opts.databaseUrl) return new PostgresStorage(opts.databaseUrl);
  return new FileStorage(opts.dataDir);
}
