import { readJSON, removeKey, writeJSON } from './storage';

export interface RecentRoom {
  id: string;
  name: string;
  visitedAt: number;
}

const KEY = 'atl:recent-rooms';

export function recentRooms(): RecentRoom[] {
  const list = readJSON<RecentRoom[]>(KEY, []);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string') : [];
}

export function rememberRoom(id: string, name: string) {
  const list = recentRooms().filter((r) => r.id !== id);
  list.unshift({ id, name, visitedAt: Date.now() });
  writeJSON(KEY, list.slice(0, 12));
}

export function forgetRoom(id: string) {
  writeJSON(
    KEY,
    recentRooms().filter((r) => r.id !== id),
  );
}

export function clearRecentRooms() {
  removeKey(KEY);
}
