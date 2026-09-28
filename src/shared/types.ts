// Domain types shared by the server and the browser.

/** Special "container" id for anime that are in the room but not placed in any tier. */
export const POOL = 'pool';
/** Board id of the shared tier list that everyone in the room can edit. */
export const GROUP_BOARD = 'group';
/** Virtual (read-only) board computed from the members' personal tier lists. */
export const CONSENSUS_BOARD = 'consensus';

export interface Tier {
  id: string;
  label: string;
  color: string;
}

/** Catalogue a title comes from: anime (AniList / MyAnimeList), or a TV series / movie (TMDB). */
export type MediaType = 'anime' | 'tv' | 'movie';

/** What a room is about. Rooms created before series and movies existed are anime rooms. */
export type RoomKind = 'anime' | 'series' | 'movies' | 'all';

export type Recommend = 'yes' | 'maybe' | 'no';
export type WatchStatus = 'watched' | 'watching' | 'plan' | 'dropped';

/**
 * Normalised data of a title: an anime (from AniList, or MyAnimeList via Jikan as a fallback) or a
 * TV series / movie (from TMDB). Named after the first catalogue the app supported.
 */
export interface AnimeMeta {
  /** "al:<anilist id>", "mal:<myanimelist id>", "tv:<tmdb id>" or "mv:<tmdb id>" */
  key: string;
  source: 'anilist' | 'jikan' | 'tmdb';
  sourceId: number;
  idMal: number | null;
  /** Romaji (anime) or Portuguese (series / movies) title */
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  cover: string;
  color: string | null;
  banner: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  year: number | null;
  /** Anime season (WINTER…); null for series and movies */
  season: string | null;
  genres: string[];
  /** Community score 0-100 */
  score: number | null;
  /** Anime studio, TV network or movie director */
  studio: string | null;
  synopsis: string;
  url: string | null;
}

export interface RoomAnime extends AnimeMeta {
  addedBy: string;
  addedAt: number;
}

export interface Review {
  /** 1..10 */
  rating: number | null;
  recommend: Recommend | null;
  status: WatchStatus | null;
  opinion: string;
  updatedAt: number;
}

export type ReviewPatch = Partial<Pick<Review, 'rating' | 'recommend' | 'status' | 'opinion'>>;

export interface Member {
  id: string;
  name: string;
  color: string;
  avatar: string;
  joinedAt: number;
}

export interface MemberInput {
  id: string;
  name: string;
  color: string;
  avatar: string;
}

/** tier id -> ordered anime keys */
export type Board = Record<string, string[]>;

export interface ChatMessage {
  id: string;
  by: string;
  at: number;
  text: string;
}

export type ActivityKind = 'join' | 'add' | 'remove' | 'move' | 'review' | 'tiers' | 'rename' | 'copy' | 'clear' | 'owner';

export interface Activity {
  id: string;
  at: number;
  by: string;
  kind: ActivityKind;
  key?: string;
  board?: string;
  to?: string;
  toLabel?: string;
  rating?: number | null;
  recommend?: Recommend | null;
  status?: WatchStatus | null;
  opinion?: boolean;
  text?: string;
}

export interface RoomState {
  id: string;
  name: string;
  /** Missing in rooms created before series and movies existed: those are anime rooms. */
  kind?: RoomKind;
  createdAt: number;
  /** The room's owner: whoever created it (the first member to join), or whoever they handed it to */
  createdBy: string | null;
  tiers: Tier[];
  /** Every title in the room (anime, series or movies), by key */
  anime: Record<string, RoomAnime>;
  /** "group" or a member id -> board */
  boards: Record<string, Board>;
  /** anime key -> member id -> review */
  reviews: Record<string, Record<string, Review>>;
  members: Record<string, Member>;
  chat: ChatMessage[];
  activity: Activity[];
}

export interface OpMeta {
  by: string;
  at: number;
  /** Server sequence number; negative for optimistic (not yet confirmed) ops. */
  seq: number;
  cid?: string;
}

export type Op =
  | { type: 'anime.add'; anime: AnimeMeta; place?: { board: string; to: string } }
  | { type: 'anime.remove'; key: string }
  | { type: 'board.move'; board: string; key: string; to: string; index: number }
  | { type: 'board.copy'; board: string; from: string }
  | { type: 'board.clear'; board: string }
  | { type: 'review.set'; key: string; patch: ReviewPatch }
  | { type: 'tiers.set'; tiers: Tier[] }
  | { type: 'room.rename'; name: string }
  | { type: 'room.owner'; to: string }
  | { type: 'member.join'; member: MemberInput }
  | { type: 'member.update'; name: string; color: string; avatar: string }
  | { type: 'chat.send'; id: string; text: string };

export type OpType = Op['type'];

/** What the server broadcasts for every accepted op. */
export interface OpEnvelope {
  seq: number;
  op: Op;
  by: string;
  at: number;
  cid?: string;
}

// ---------------------------------------------------------------------------
// Presence (ephemeral, never persisted)

export type RoomTab = 'tierlist' | 'explore' | 'ranking' | 'members' | 'chat';

export interface DragPresence {
  key: string;
  /** container being hovered: tier id or POOL */
  over: string | null;
  index: number | null;
}

export interface PresenceState {
  userId: string;
  tab: RoomTab | null;
  board: string | null;
  /** anime key open in the details dialog */
  viewing: string | null;
  /** "chat" or an anime key (writing an opinion) */
  typing: string | null;
  dragging: DragPresence | null;
}

export type PresencePatch = Partial<Omit<PresenceState, 'userId'>>;

export interface CursorState {
  board: string;
  /** tier id / POOL the pointer is over */
  zone: string;
  /** position inside the zone, 0..1 */
  fx: number;
  fy: number;
}

// ---------------------------------------------------------------------------
// Socket protocol

export interface JoinUser {
  id: string;
  secret: string;
  name: string;
  color: string;
  avatar: string;
}

export interface JoinOk {
  ok: true;
  state: RoomState;
  seq: number;
  presence: PresenceState[];
  lastSeen: Record<string, number>;
}

export interface AckError {
  ok: false;
  error: string;
}

export type JoinAck = JoinOk | AckError;
export type OpAck = { ok: true; seq: number } | AckError;
export type SyncAck = { ok: true; state: RoomState; seq: number } | AckError;
