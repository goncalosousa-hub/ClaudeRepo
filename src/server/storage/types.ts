import type { CommunityRoom, RoomState } from '../../shared/types';

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
  profile: { name: string; color: string; avatar: string; unit?: string };
  /** Rooms this account has been in: room id -> last visit */
  rooms: Record<string, { name: string; visitedAt: number }>;
  createdAt: number;
}

/** A photo someone added to a title: the full image and a small one for lists (both JPEG). */
export interface StoredPhoto {
  id: string;
  roomId: string;
  key: string;
  userId: string;
  data: Buffer;
  thumb: Buffer;
}

export interface Storage {
  readonly kind: string;
  /** Human description shown when the server starts (never contains passwords). */
  readonly label: string;
  init(): Promise<void>;
  load(id: string): Promise<RoomDoc | null>;
  save(id: string, doc: RoomDoc): Promise<void>;
  /** Rooms shown in the community rooms, as saved (who is online only the live server knows). */
  listedRooms(): Promise<Omit<CommunityRoom, 'online'>[]>;
  loadAccount(username: string): Promise<AccountDoc | null>;
  /** Adds a new account; returns false (and changes nothing) when the username is taken. */
  createAccount(doc: AccountDoc): Promise<boolean>;
  saveAccount(doc: AccountDoc): Promise<void>;
  savePhoto(photo: StoredPhoto): Promise<void>;
  /** The JPEG of a photo (or of its small version), null when it does not exist. */
  loadPhoto(id: string, thumb: boolean): Promise<Buffer | null>;
  deletePhotos(ids: string[]): Promise<void>;
  /** Space taken by all the photos, in bytes. */
  photoBytes(): Promise<number>;
  close(): Promise<void>;
}
