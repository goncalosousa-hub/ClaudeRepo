// Room kinds (anime, series, movies or all of them) and the media type of each title.
import type { MediaType, RoomKind, RoomState } from './types';

export const ROOM_KINDS: RoomKind[] = ['anime', 'series', 'movies', 'all'];

const KIND_MEDIA: Record<RoomKind, MediaType[]> = {
  anime: ['anime'],
  series: ['tv'],
  movies: ['movie'],
  all: ['anime', 'tv', 'movie'],
};

/** The media type is part of the key: "al:1" / "mal:1" → anime, "tv:1" → series, "mv:1" → movie. */
export function mediaTypeOf(key: string): MediaType {
  if (key.startsWith('tv:')) return 'tv';
  if (key.startsWith('mv:')) return 'movie';
  return 'anime';
}

export const roomKind = (room: Pick<RoomState, 'kind'>): RoomKind => room.kind ?? 'anime';
export const mediaOfKind = (kind: RoomKind): MediaType[] => KIND_MEDIA[kind];
export const acceptsMedia = (kind: RoomKind, media: MediaType) => KIND_MEDIA[kind].includes(media);
