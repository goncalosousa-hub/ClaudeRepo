// The admins' page: what is in the community, and deleting people and rooms (accounts in ADMINS).
import type { RoomKind } from '../../shared/types';
import { request } from './account-api';
import type { LocalUser } from './identity';

type SignedIn = LocalUser & { account: string };

export interface AdminOverview {
  sections: { id: string; members: number; titles: number; reviews: number; photos: number; messages: number; online: number }[];
  people: number;
  online: number;
  accounts: number;
  googleAccounts: number;
  rooms: number;
  photoBytes: number;
  config: {
    google: { domains: string[] } | null;
    communityCode: boolean;
    googleOnly: boolean;
    tmdb: boolean;
    admins: string[];
    photosMaxBytes: number;
  };
}

export interface AdminPerson {
  id: string;
  name: string;
  color: string;
  avatar: string;
  unit: string;
  sections: string[];
  joinedAt: number | null;
  lastSeen: number | null;
  online: boolean;
  titles: number;
  reviews: number;
  photos: number;
  messages: number;
  account: { username: string; google: string | null; createdAt: number; admin: boolean } | null;
}

export interface AdminRoom {
  id: string;
  name: string;
  kind: RoomKind;
  listed: boolean;
  members: number;
  titles: number;
  createdAt: number;
  updatedAt: number;
  online: number;
}

export const adminOverview = (user: SignedIn) => request<AdminOverview>('GET', '/api/admin/overview', undefined, user);

export const adminPeople = (user: SignedIn) => request<{ people: AdminPerson[]; me: string }>('GET', '/api/admin/people', undefined, user);

export const deletePerson = (user: SignedIn, id: string) =>
  request<{ ok: true; rooms: string[]; accounts: string[] }>('DELETE', `/api/admin/people/${encodeURIComponent(id)}`, undefined, user);

export const adminRooms = (user: SignedIn) => request<{ rooms: AdminRoom[] }>('GET', '/api/admin/rooms', undefined, user);

export const deleteRoom = (user: SignedIn, id: string) => request<{ ok: true }>('DELETE', `/api/admin/rooms/${encodeURIComponent(id)}`, undefined, user);
