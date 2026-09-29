// Room kinds (films, series, anime, books, restaurants, places) and the media type of each title.
import type { CommunityRoom, MediaType, RoomKind, RoomState } from './types';

export const ROOM_KINDS: RoomKind[] = ['anime', 'series', 'movies', 'all', 'books', 'restaurants', 'places'];

const KIND_MEDIA: Record<RoomKind, MediaType[]> = {
  anime: ['anime'],
  series: ['tv'],
  movies: ['movie'],
  // Also the order of the catalogue tabs in the room: films, series, anime.
  all: ['movie', 'tv', 'anime'],
  books: ['book'],
  restaurants: ['restaurant'],
  places: ['place'],
};

/**
 * The media type is part of the key: "al:1" / "mal:1" → anime, "tv:1" → series, "mv:1" → movie,
 * "bk:1" → book, "rs:…" → restaurant, "pl:…" → place.
 */
export function mediaTypeOf(key: string): MediaType {
  if (key.startsWith('tv:')) return 'tv';
  if (key.startsWith('mv:')) return 'movie';
  if (key.startsWith('bk:')) return 'book';
  if (key.startsWith('rs:')) return 'restaurant';
  if (key.startsWith('pl:')) return 'place';
  return 'anime';
}

/** Restaurants and places: no catalogue picture, found on the map or added by hand. */
export const isPlaceMedia = (media: MediaType) => media === 'restaurant' || media === 'place';

export const roomKind = (room: Pick<RoomState, 'kind'>): RoomKind => room.kind ?? 'anime';
export const mediaOfKind = (kind: RoomKind): MediaType[] => KIND_MEDIA[kind];
export const acceptsMedia = (kind: RoomKind, media: MediaType) => KIND_MEDIA[kind].includes(media);

/** How a room appears in the community rooms. */
export function communitySummary(s: RoomState): Omit<CommunityRoom, 'online'> {
  const last = Math.max(s.createdAt, s.activity.at(-1)?.at ?? 0, s.chat.at(-1)?.at ?? 0);
  return {
    id: s.id,
    name: s.name,
    kind: roomKind(s),
    members: Object.keys(s.members).length,
    titles: Object.keys(s.anime).length,
    updatedAt: last,
  };
}
