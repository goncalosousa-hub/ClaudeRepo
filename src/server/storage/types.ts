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

/** A login (username + password) that gives back the same identity on any link or device. */
export interface AccountDoc {
  v: 1;
  username: string;
  /** The identity used in rooms */
  userId: string;
  secret: string;
  /** "scrypt$N$r$p$salt$hash" */
  password: string;
  profile: { name: string; color: string; avatar: string };
  /** Rooms this account has been in: room id -> last visit */
  rooms: Record<string, { name: string; visitedAt: number }>;
  createdAt: number;
}

export interface Storage {
  readonly kind: string;
  /** Human description shown when the server starts (never contains passwords). */
  readonly label: string;
  init(): Promise<void>;
  load(id: string): Promise<RoomDoc | null>;
  save(id: string, doc: RoomDoc): Promise<void>;
  loadAccount(username: string): Promise<AccountDoc | null>;
  /** Adds a new account; returns false (and changes nothing) when the username is taken. */
  createAccount(doc: AccountDoc): Promise<boolean>;
  saveAccount(doc: AccountDoc): Promise<void>;
  close(): Promise<void>;
}
