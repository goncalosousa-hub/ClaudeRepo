// The last known state of the rooms this browser has seen. Going back to one (or moving to another
// community space) shows it at once, while the live connection catches up in the background.
import { COMMUNITY_SECTIONS } from '../../shared/constants';
import type { RoomState } from '../../shared/types';

export interface CachedRoom {
  state: RoomState;
  seq: number;
  lastSeen: Record<string, number>;
}

const MAX_ROOMS = 12;
/** A community space fetched in the last minute is fresh enough. */
const FRESH_MS = 60_000;

const cache = new Map<string, CachedRoom & { at: number }>();
const loading = new Set<string>();

export function cachedRoom(id: string): CachedRoom | undefined {
  return cache.get(id);
}

/** Keeps the newest state of a room: an older one (a lower sequence number) never replaces it. */
export function cacheRoom(id: string, room: CachedRoom) {
  const known = cache.get(id);
  if (known && known.seq > room.seq) return;
  cache.delete(id);
  cache.set(id, { ...room, at: Date.now() });
  while (cache.size > MAX_ROOMS) cache.delete(cache.keys().next().value!);
}

/** Fetches the other community spaces in the background, so moving to one of them is instant. */
export function prefetchCommunity(current: string) {
  for (const { id } of COMMUNITY_SECTIONS) {
    const known = cache.get(id);
    if (id === current || loading.has(id) || (known && Date.now() - known.at < FRESH_MS)) continue;
    loading.add(id);
    fetch(`/api/rooms/${id}/state`)
      .then((res) => (res.ok ? (res.json() as Promise<Partial<CachedRoom>>) : null))
      .then((data) => {
        if (data?.state && typeof data.seq === 'number') cacheRoom(id, { state: data.state, seq: data.seq, lastSeen: data.lastSeen ?? {} });
      })
      .catch(() => {})
      .finally(() => loading.delete(id));
  }
}
