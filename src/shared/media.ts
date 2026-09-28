// Room kinds (anime, series, movies or all of them) and the media type of each title.
import type { CommunityRoom, MediaType, RoomKind, RoomState } from './types';

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
