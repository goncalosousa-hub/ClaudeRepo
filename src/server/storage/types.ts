import type { RoomState } from '../../shared/types';

/** What is persisted for each room. `secrets` and `lastSeen` never leave the server. */
export interface RoomDoc {
  v: 1;
  seq: number;
  state: RoomState;
  /** user id -> sha256(secret) — proves that a browser owns a user id */
  secrets: Record<string, string>;
  lastSeen: Record<string, number>;
}

export interface Storage {
  readonly kind: string;
  /** Human description shown when the server starts (never contains passwords). */
  readonly label: string;
  init(): Promise<void>;
  load(id: string): Promise<RoomDoc | null>;
  save(id: string, doc: RoomDoc): Promise<void>;
  close(): Promise<void>;
}
