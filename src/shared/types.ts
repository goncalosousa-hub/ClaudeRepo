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

/**
 * What a title is: an anime (AniList / MyAnimeList), a TV series or movie (TMDB), a book (Open
 * Library), or a restaurant or place to visit (OpenStreetMap, or added by hand).
 */
export type MediaType = 'anime' | 'tv' | 'movie' | 'book' | 'restaurant' | 'place';

/**
 * What a room is about ("all" is films, series and anime). Rooms created before series and movies
 * existed are anime rooms.
 */
export type RoomKind = 'anime' | 'series' | 'movies' | 'all' | 'books' | 'restaurants' | 'places';

export type Recommend = 'yes' | 'maybe' | 'no';
export type WatchStatus = 'watched' | 'watching' | 'plan' | 'dropped';

/** Where a restaurant or place is. */
export interface PlaceInfo {
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
}

/**
 * Normalised data of a title: an anime (from AniList, or MyAnimeList via Jikan as a fallback), a TV
 * series / movie (from TMDB), a book (Open Library) or a restaurant / place (OpenStreetMap, or added
 * by hand). Named after the first catalogue the app supported.
 */
export interface AnimeMeta {
  /**
   * "al:<anilist id>", "mal:<myanimelist id>", "tv:<tmdb id>", "mv:<tmdb id>", "bk:<open library
   * work number>", or "rs:" (restaurant) / "pl:" (place) + "n|w|r<openstreetmap id>" or "x<random>"
   * when added by hand
   */
  key: string;
  source: 'anilist' | 'jikan' | 'tmdb' | 'openlibrary' | 'osm' | 'user';
  /** Id in the catalogue (0 for titles added by hand) */
  sourceId: number;
  idMal: number | null;
  /** Romaji (anime) or Portuguese (series / movies) title */
  title: string;
  titleEnglish: string | null;
  titleNative: string | null;
  /** Empty for restaurants and places: their cover is the first photo */
  cover: string;
  color: string | null;
  banner: string | null;
  /** TV, MOVIE, BOOK… or the kind of restaurant / place (restaurant, cafe, beach, museum…) */
  format: string | null;
  status: string | null;
  /** Episodes (or pages, for books) */
  episodes: number | null;
  year: number | null;
  /** Anime season (WINTER…); null for series and movies */
  season: string | null;
  genres: string[];
  /** Community score 0-100 */
  score: number | null;
  /** Anime studio, TV network, movie director or book authors */
  studio: string | null;
  synopsis: string;
  url: string | null;
  /** Restaurants and places only */
  place?: PlaceInfo | null;
}

/** A photo someone added to a title (the image is served by /api/photos/<id>). */
export interface Photo {
  id: string;
  by: string;
  at: number;
  /** Size of the full image, in pixels */
  w: number;
  h: number;
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
  /** Company or unit of the group where the person works (missing in older rooms) */
  unit?: string;
  joinedAt: number;
}

export interface MemberInput {
  id: string;
  name: string;
  color: string;
  avatar: string;
  unit?: string;
}

/** tier id -> ordered anime keys */
export type Board = Record<string, string[]>;

export interface ChatMessage {
  id: string;
  by: string;
  at: number;
  text: string;
}

export type ActivityKind =
  | 'join'
  | 'add'
  | 'remove'
  | 'move'
  | 'review'
  | 'tiers'
  | 'rename'
  | 'copy'
  | 'clear'
  | 'owner'
  | 'listed'
  | 'kind'
  | 'photo';

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
  /** room.listed: shown in (true) or removed from (false) the community rooms */
  listed?: boolean;
  /** photo: how many photos were added (several in a row count as one entry) */
  count?: number;
}

export interface RoomState {
  id: string;
  name: string;
  /** Missing in rooms created before series and movies existed: those are anime rooms. */
  kind?: RoomKind;
  /** Shown in the community rooms on the home page, so any colleague can find and join it */
  listed?: boolean;
  /**
   * The community space: everyone is in it. It has no owner and no shared "Grupo" board (the
   * community tier list is the average of everyone's personal ones), and its tiers are fixed.
   */
  global?: boolean;
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
  /** anime key -> photos, oldest first (missing in rooms created before photos existed) */
  photos?: Record<string, Photo[]>;
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
  | { type: 'room.listed'; listed: boolean }
  | { type: 'room.kind'; kind: RoomKind }
  /** Sent by the server when a photo is uploaded (browsers upload through /api/photos) */
  | { type: 'photo.add'; key: string; photo: { id: string; w: number; h: number } }
  | { type: 'photo.remove'; key: string; id: string }
  | { type: 'member.join'; member: MemberInput }
  | { type: 'member.update'; name: string; color: string; avatar: string; unit?: string }
  | { type: 'chat.send'; id: string; text: string };

export type OpType = Op['type'];

/** A room in the community rooms (home page). */
export interface CommunityRoom {
  id: string;
  name: string;
  kind: RoomKind;
  members: number;
  titles: number;
  /** People in the room right now */
  online: number;
  /** Last change (ms) */
  updatedAt: number;
}

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
  unit?: string;
}

export interface JoinOk {
  ok: true;
  state: RoomState;
  seq: number;
  presence: PresenceState[];
  lastSeen: Record<string, number>;
  /** Community admin (can remove any title or photo) */
  admin?: boolean;
}

export interface AckError {
  ok: false;
  error: string;
}

export type JoinAck = JoinOk | AckError;
export type OpAck = { ok: true; seq: number } | AckError;
export type SyncAck = { ok: true; state: RoomState; seq: number } | AckError;
