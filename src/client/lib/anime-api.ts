// Anime catalogue: AniList GraphQL API (https://anilist.co), with MyAnimeList (through the Jikan
// API, https://jikan.moe) as an automatic fallback when AniList is down or rate limiting us.
// Both are free, need no key and are called straight from the browser.
import type { AnimeMeta, MediaType } from '../../shared/types';

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const DEFAULT_COVER = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg';
const SYNOPSIS_MAX = 1500;

export type SortKey =
  | 'relevance'
  | 'popularity'
  | 'trending'
  | 'score'
  | 'newest'
  | 'favourites'
  | 'airing'
  | 'upcoming'
  /** Books in Portuguese */
  | 'portuguese';
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface BrowseParams {
  search?: string;
  sort?: SortKey;
  /** AniList genre (anime), TMDB genre id (series and movies) or book subject (BOOK_SUBJECTS id) */
  genre?: string;
  season?: Season;
  year?: number;
  format?: string;
}

export interface BrowseResult {
  items: AnimeMeta[];
  hasNext: boolean;
  total: number | null;
  source: 'anilist' | 'jikan' | 'tmdb' | 'openlibrary' | 'osm';
}

export interface AnimeDetails {
  meta: AnimeMeta;
  coverLarge: string;
  synopsis: string;
  duration: number | null;
  source: string | null;
  endYear: number | null;
  trailerUrl: string | null;
  tags: string[];
  nextEpisode: { episode: number; airingAt: number } | null;
  recommendations: AnimeMeta[];
  /** Series and movies (TMDB) only */
  seasons?: number | null;
  cast?: string[];
  creators?: string[];
}

export class AnimeApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfter = 0,
  ) {
    super(message);
    this.name = 'AnimeApiError';
  }
}

// ---------------------------------------------------------------------------
// Labels (PT-PT)

export const GENRES: { id: string; label: string }[] = [
  { id: 'Action', label: 'Ação' },
  { id: 'Adventure', label: 'Aventura' },
  { id: 'Comedy', label: 'Comédia' },
  { id: 'Drama', label: 'Drama' },
  { id: 'Ecchi', label: 'Ecchi' },
  { id: 'Fantasy', label: 'Fantasia' },
  { id: 'Horror', label: 'Terror' },
  { id: 'Mahou Shoujo', label: 'Mahou Shoujo' },
  { id: 'Mecha', label: 'Mecha' },
  { id: 'Music', label: 'Música' },
  { id: 'Mystery', label: 'Mistério' },
  { id: 'Psychological', label: 'Psicológico' },
  { id: 'Romance', label: 'Romance' },
  { id: 'Sci-Fi', label: 'Ficção científica' },
  { id: 'Slice of Life', label: 'Slice of Life' },
  { id: 'Sports', label: 'Desporto' },
  { id: 'Supernatural', label: 'Sobrenatural' },
  { id: 'Thriller', label: 'Thriller' },
];

export const FORMATS: { id: string; label: string }[] = [
  { id: 'TV', label: 'Série TV' },
  { id: 'TV_SHORT', label: 'TV curta' },
  { id: 'MOVIE', label: 'Filme' },
  { id: 'OVA', label: 'OVA' },
  { id: 'ONA', label: 'ONA' },
  { id: 'SPECIAL', label: 'Especial' },
  { id: 'MUSIC', label: 'Música' },
];

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'WINTER', label: 'Inverno' },
  { id: 'SPRING', label: 'Primavera' },
  { id: 'SUMMER', label: 'Verão' },
  { id: 'FALL', label: 'Outono' },
];

export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'popularity', label: 'Mais populares' },
  { id: 'trending', label: 'Em alta' },
  { id: 'score', label: 'Melhor pontuação' },
  { id: 'newest', label: 'Mais recentes' },
  { id: 'favourites', label: 'Mais favoritos' },
];

const STATUS_LABELS: Record<string, string> = {
  FINISHED: 'Terminado',
  RELEASING: 'Em exibição',
  NOT_YET_RELEASED: 'Por estrear',
  CANCELLED: 'Cancelado',
  HIATUS: 'Em pausa',
};
/** Series are feminine in Portuguese ("série terminada"); a released movie has "estreado". */
const STATUS_LABELS_TV: Record<string, string> = { ...STATUS_LABELS, FINISHED: 'Terminada', CANCELLED: 'Cancelada' };
const STATUS_LABELS_MOVIE: Record<string, string> = { ...STATUS_LABELS, FINISHED: 'Estreado', RELEASING: 'Nos cinemas' };

/** Genres that only series and movies (TMDB) or books (Open Library) have, besides the anime ones above. */
const MORE_GENRES: Record<string, string> = {
  Biography: 'Biografia',
  Poetry: 'Poesia',
  Comics: 'Banda desenhada',
  Philosophy: 'Filosofia',
  'Self-help': 'Autoajuda',
  Business: 'Negócios',
  Classics: 'Clássicos',
  Science: 'Ciência',
  Animation: 'Animação',
  Crime: 'Crime',
  Documentary: 'Documentário',
  Family: 'Família',
  History: 'História',
  'TV Movie': 'Filme para TV',
  War: 'Guerra',
  Western: 'Western',
  Kids: 'Infantil',
  News: 'Notícias',
  Reality: 'Reality show',
  Soap: 'Novela',
  Talk: 'Talk show',
  Politics: 'Política',
};

const FORMAT_LABELS: Record<string, string> = { SERIES: 'Série' };

const SOURCE_LABELS: Record<string, string> = {
  ORIGINAL: 'Original',
  MANGA: 'Manga',
  LIGHT_NOVEL: 'Light novel',
  VISUAL_NOVEL: 'Visual novel',
  VIDEO_GAME: 'Videojogo',
  GAME: 'Jogo',
  NOVEL: 'Romance',
  WEB_NOVEL: 'Web novel',
  DOUJINSHI: 'Doujinshi',
  ANIME: 'Anime',
  LIVE_ACTION: 'Live action',
  COMIC: 'Banda desenhada',
  MULTIMEDIA_PROJECT: 'Projeto multimédia',
  PICTURE_BOOK: 'Livro ilustrado',
  OTHER: 'Outro',
};

export const genreLabel = (id: string) => GENRES.find((g) => g.id === id)?.label ?? MORE_GENRES[id] ?? id;
export const formatLabel = (id: string | null) =>
  id ? (FORMATS.find((f) => f.id === id)?.label ?? FORMAT_LABELS[id] ?? id) : null;
export const seasonLabel = (id: string | null) => (id ? (SEASONS.find((s) => s.id === id)?.label ?? id) : null);
export const statusLabel = (id: string | null, media: MediaType = 'anime') =>
  id ? ((media === 'tv' ? STATUS_LABELS_TV : media === 'movie' ? STATUS_LABELS_MOVIE : STATUS_LABELS)[id] ?? id) : null;
export const sourceLabel = (id: string | null) => (id ? (SOURCE_LABELS[id] ?? id) : null);

export function currentSeason(date = new Date()): { season: Season; year: number } {
  const m = date.getMonth();
  const season: Season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getFullYear() };
}

/** Title to show, following the user's preference. */
export function displayTitle(a: Pick<AnimeMeta, 'title' | 'titleEnglish'>, pref: 'romaji' | 'english') {
  return pref === 'english' && a.titleEnglish ? a.titleEnglish : a.title;
}

// ---------------------------------------------------------------------------
// Helpers

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

/** AniList descriptions contain a bit of HTML (<br>, <i>…): keep plain text only. */
export function cleanDescription(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withoutEmpty(vars: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

// ---------------------------------------------------------------------------
// AniList

const MEDIA_FIELDS = `
  id idMal isAdult
  title { romaji english native }
  coverImage { large extraLarge color }
  bannerImage format status episodes season seasonYear
  startDate { year }
  genres averageScore
  studios(isMain: true) { nodes { name } }
  siteUrl
  description(asHtml: false)
`;

const BROWSE_QUERY = `
query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $genre: String, $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $statusNot: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total hasNextPage }
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, genre: $genre, season: $season, seasonYear: $seasonYear, format: $format, status_not: $statusNot) {
      ${MEDIA_FIELDS}
    }
  }
}`;

const DETAILS_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${MEDIA_FIELDS}
    duration
    source(version: 3)
    endDate { year }
    trailer { id site }
    tags { name rank isMediaSpoiler }
    nextAiringEpisode { episode airingAt }
    recommendations(sort: RATING_DESC, perPage: 12) {
      nodes { mediaRecommendation { ${MEDIA_FIELDS} } }
    }
  }
}`;

const SORT_MAP: Partial<Record<SortKey, string[]>> = {
  relevance: ['SEARCH_MATCH', 'POPULARITY_DESC'],
  popularity: ['POPULARITY_DESC'],
  trending: ['TRENDING_DESC', 'POPULARITY_DESC'],
  score: ['SCORE_DESC'],
  newest: ['START_DATE_DESC'],
  favourites: ['FAVOURITES_DESC'],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

async function anilist(query: string, variables: Record<string, unknown>): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: withoutEmpty(variables) }),
    });
  } catch {
    throw new AnimeApiError('Não foi possível contactar o AniList.', 0);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 30;
    throw new AnimeApiError('O AniList está a limitar os pedidos. Tenta daqui a pouco.', 429, retry);
  }
  let json: Json;
  try {
    json = await res.json();
  } catch {
    throw new AnimeApiError(`Resposta inválida do AniList (${res.status}).`, res.status);
  }
  if (!res.ok || json?.errors?.length) {
    const status = Number(json?.errors?.[0]?.status) || res.status;
    if (status === 404) throw new AnimeApiError('Anime não encontrado.', 404);
    throw new AnimeApiError(json?.errors?.[0]?.message ?? `Erro do AniList (${res.status}).`, status);
  }
  return json.data;
}

export function fromAniList(m: Json): AnimeMeta {
  const title = m.title?.romaji || m.title?.english || m.title?.native || `Anime #${m.id}`;
  return {
    key: `al:${m.id}`,
    source: 'anilist',
    sourceId: m.id,
    idMal: m.idMal ?? null,
    title,
    titleEnglish: m.title?.english && m.title.english !== title ? m.title.english : null,
    titleNative: m.title?.native ?? null,
    cover: m.coverImage?.large || m.coverImage?.extraLarge || DEFAULT_COVER,
    color: isHex(m.coverImage?.color) ? m.coverImage.color : null,
    banner: m.bannerImage ?? null,
    format: m.format ?? null,
    status: m.status ?? null,
    episodes: m.episodes ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    season: m.season ?? null,
    genres: Array.isArray(m.genres) ? m.genres.slice(0, 20) : [],
    score: m.averageScore ?? null,
    studio: m.studios?.nodes?.[0]?.name ?? null,
    synopsis: cleanDescription(m.description).slice(0, SYNOPSIS_MAX),
    url: m.siteUrl ?? `https://anilist.co/anime/${m.id}`,
  };
}

async function browseAniList(p: BrowseParams, page: number): Promise<BrowseResult> {
  const sort = p.sort ?? (p.search ? 'relevance' : 'popularity');
  const data = await anilist(
    BROWSE_QUERY,
    {
      page,
      perPage: 30,
      search: p.search?.trim(),
      sort: SORT_MAP[sort === 'relevance' && !p.search ? 'popularity' : sort] ?? SORT_MAP.popularity,
      genre: p.genre,
      season: p.year ? p.season : undefined,
      seasonYear: p.year,
      format: p.format,
      statusNot: sort === 'newest' ? 'NOT_YET_RELEASED' : undefined,
    },
  );
  return {
    items: (data.Page.media as Json[]).filter((m) => m && !m.isAdult).map(fromAniList),
    hasNext: !!data.Page.pageInfo?.hasNextPage,
    total: data.Page.pageInfo?.total ?? null,
    source: 'anilist',
  };
}

async function detailsAniList(meta: AnimeMeta): Promise<AnimeDetails> {
  const data = await anilist(DETAILS_QUERY, { id: meta.sourceId });
  const m = data.Media;
  const fresh = fromAniList(m);
  const trailer = m.trailer?.id
    ? m.trailer.site === 'youtube'
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(m.trailer.id)}`
      : m.trailer.site === 'dailymotion'
        ? `https://www.dailymotion.com/video/${encodeURIComponent(m.trailer.id)}`
        : null
    : null;
  return {
    meta: fresh,
    coverLarge: m.coverImage?.extraLarge || fresh.cover,
    synopsis: cleanDescription(m.description),
    duration: m.duration ?? null,
    source: m.source ?? null,
    endYear: m.endDate?.year ?? null,
    trailerUrl: trailer,
    tags: ((m.tags ?? []) as Json[])
      .filter((t) => !t.isMediaSpoiler && t.rank >= 60)
      .slice(0, 8)
      .map((t) => t.name as string),
    nextEpisode: m.nextAiringEpisode ?? null,
    recommendations: ((m.recommendations?.nodes ?? []) as Json[])
      .map((n) => n.mediaRecommendation)
      .filter((r) => r && !r.isAdult)
      .map(fromAniList),
  };
}

// ---------------------------------------------------------------------------
// Jikan (MyAnimeList) — fallback

const JIKAN_GENRES: Record<string, number> = {
  Action: 1, Adventure: 2, Comedy: 4, Drama: 8, Ecchi: 9, Fantasy: 10, Horror: 14, 'Mahou Shoujo': 66,
  Mecha: 18, Music: 19, Mystery: 7, Psychological: 40, Romance: 22, 'Sci-Fi': 24, 'Slice of Life': 36,
  Sports: 30, Supernatural: 37, Thriller: 41,
};
const JIKAN_TYPES: Record<string, string> = {
  TV: 'tv', TV_SHORT: 'tv', MOVIE: 'movie', OVA: 'ova', ONA: 'ona', SPECIAL: 'special', MUSIC: 'music',
};
const FROM_JIKAN_TYPE: Record<string, string> = {
  TV: 'TV', Movie: 'MOVIE', OVA: 'OVA', ONA: 'ONA', Special: 'SPECIAL', 'TV Special': 'SPECIAL', Music: 'MUSIC',
};
const FROM_JIKAN_STATUS: Record<string, string> = {
  'Finished Airing': 'FINISHED', 'Currently Airing': 'RELEASING', 'Not yet aired': 'NOT_YET_RELEASED',
};

let jikanLast = 0;
async function jikan(path: string): Promise<Json> {
  // Jikan allows ~3 requests per second.
  const wait = jikanLast + 400 - Date.now();
  jikanLast = Math.max(Date.now(), jikanLast + 400);
  if (wait > 0) await sleep(wait);
  let res: Response;
  try {
    res = await fetch(`${JIKAN_URL}${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new AnimeApiError('Não foi possível contactar o MyAnimeList (Jikan).', 0);
  }
  if (res.status === 404) throw new AnimeApiError('Anime não encontrado.', 404);
  if (!res.ok) throw new AnimeApiError(`Erro do MyAnimeList/Jikan (${res.status}).`, res.status);
  return res.json();
}

export function fromJikan(a: Json): AnimeMeta {
  const title = a.title || a.title_english || `Anime #${a.mal_id}`;
  const cover = a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || a.images?.webp?.large_image_url;
  return {
    key: `mal:${a.mal_id}`,
    source: 'jikan',
    sourceId: a.mal_id,
    idMal: a.mal_id,
    title,
    titleEnglish: a.title_english && a.title_english !== title ? a.title_english : null,
    titleNative: a.title_japanese ?? null,
    cover: cover || DEFAULT_COVER,
    color: null,
    banner: null,
    format: FROM_JIKAN_TYPE[a.type] ?? null,
    status: FROM_JIKAN_STATUS[a.status] ?? null,
    episodes: a.episodes ?? null,
    year: a.year ?? a.aired?.prop?.from?.year ?? null,
    season: typeof a.season === 'string' ? a.season.toUpperCase() : null,
    genres: Array.isArray(a.genres) ? a.genres.map((g: Json) => g.name).slice(0, 20) : [],
    score: typeof a.score === 'number' ? Math.round(a.score * 10) : null,
    studio: a.studios?.[0]?.name ?? null,
    synopsis: (a.synopsis ?? '').replace(/\[Written by MAL Rewrite\]/g, '').trim().slice(0, SYNOPSIS_MAX),
    url: a.url ?? `https://myanimelist.net/anime/${a.mal_id}`,
  };
}

async function browseJikan(p: BrowseParams, page: number): Promise<BrowseResult> {
  const qs = new URLSearchParams({ page: String(page), limit: '25', sfw: 'true' });
  const type = p.format ? JIKAN_TYPES[p.format] : undefined;
  let path: string;
  if (p.year && p.season && !p.search) {
    if (type) qs.set('filter', type);
    path = `/seasons/${p.year}/${p.season.toLowerCase()}`;
  } else if (!p.search && !p.genre && !p.year && p.sort !== 'newest') {
    if (type) qs.set('type', type);
    const filters: Record<string, string> = { trending: 'airing', popularity: 'bypopularity', favourites: 'favorite' };
    const filter = filters[p.sort ?? 'popularity'];
    if (filter) qs.set('filter', filter);
    path = '/top/anime';
  } else {
    if (p.search) qs.set('q', p.search.trim());
    if (type) qs.set('type', type);
    if (p.genre && JIKAN_GENRES[p.genre]) qs.set('genres', String(JIKAN_GENRES[p.genre]));
    if (p.year) {
      qs.set('start_date', `${p.year}-01-01`);
      qs.set('end_date', `${p.year}-12-31`);
    }
    const order: Partial<Record<SortKey, [string, string]>> = {
      popularity: ['members', 'desc'],
      trending: ['members', 'desc'],
      score: ['score', 'desc'],
      newest: ['start_date', 'desc'],
      favourites: ['favorites', 'desc'],
    };
    const o = p.sort && p.sort !== 'relevance' ? order[p.sort] : p.search ? undefined : order.popularity;
    if (o) {
      qs.set('order_by', o[0]);
      qs.set('sort', o[1]);
    }
    path = '/anime';
  }
  const json = await jikan(`${path}?${qs}`);
  const seen = new Set<number>();
  const items = ((json.data ?? []) as Json[]).filter((a) => a?.mal_id && !seen.has(a.mal_id) && seen.add(a.mal_id));
  return {
    items: items.map(fromJikan),
    hasNext: !!json.pagination?.has_next_page,
    total: json.pagination?.items?.total ?? null,
    source: 'jikan',
  };
}

async function detailsJikan(meta: AnimeMeta): Promise<AnimeDetails> {
  const id = meta.idMal ?? meta.sourceId;
  const json = await jikan(`/anime/${id}/full`);
  const a = json.data;
  const fresh = fromJikan(a);
  const minutes = typeof a.duration === 'string' ? Number(a.duration.match(/(\d+)\s*min/)?.[1]) || null : null;
  return {
    meta: meta.source === 'jikan' ? fresh : meta,
    coverLarge: a.images?.jpg?.large_image_url || fresh.cover,
    synopsis: (a.synopsis ?? '').replace(/\[Written by MAL Rewrite\]/g, '').trim(),
    duration: minutes,
    source: a.source ?? null,
    endYear: a.aired?.prop?.to?.year ?? null,
    trailerUrl: a.trailer?.url ?? (a.trailer?.youtube_id ? `https://www.youtube.com/watch?v=${a.trailer.youtube_id}` : null),
    tags: [...(a.themes ?? []), ...(a.demographics ?? [])].map((t: Json) => t.name).slice(0, 8),
    nextEpisode: null,
    recommendations: [],
  };
}

// ---------------------------------------------------------------------------
// Public API with fallback + caching

let anilistDownUntil = 0;
const shouldFallback = (err: unknown) =>
  err instanceof AnimeApiError && (err.status === 0 || err.status === 429 || err.status === 403 || err.status >= 500);

/** Which catalogue is being used right now (for a small notice in the UI). */
export function activeSource(): 'anilist' | 'jikan' {
  return Date.now() < anilistDownUntil ? 'jikan' : 'anilist';
}

const browseCache = new Map<string, Promise<BrowseResult>>();

/**
 * One page of results. Requests are shared and cached (not cancellable): a caller that no
 * longer needs the answer simply ignores it.
 */
export function browseAnime(params: BrowseParams, page = 1): Promise<BrowseResult> {
  const useJikan = Date.now() < anilistDownUntil;
  const cacheKey = JSON.stringify([useJikan ? 'j' : 'a', params, page]);
  const hit = browseCache.get(cacheKey);
  if (hit) return hit;

  const run = async (): Promise<BrowseResult> => {
    if (!useJikan) {
      try {
        return await browseAniList(params, page);
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        anilistDownUntil = Date.now() + 2 * 60_000;
        try {
          return await browseJikan(params, page);
        } catch {
          throw err;
        }
      }
    }
    return browseJikan(params, page);
  };

  const promise = run();
  browseCache.set(cacheKey, promise);
  promise.catch(() => browseCache.delete(cacheKey));
  if (browseCache.size > 80) browseCache.delete(browseCache.keys().next().value!);
  return promise;
}

const detailsCache = new Map<string, Promise<AnimeDetails>>();

export function animeDetails(meta: AnimeMeta): Promise<AnimeDetails> {
  const hit = detailsCache.get(meta.key);
  if (hit) return hit;
  const run = async () => {
    if (meta.source === 'jikan') return detailsJikan(meta);
    try {
      return await detailsAniList(meta);
    } catch (err) {
      if (shouldFallback(err) && meta.idMal) return detailsJikan(meta);
      throw err;
    }
  };
  const promise = run();
  detailsCache.set(meta.key, promise);
  promise.catch(() => detailsCache.delete(meta.key));
  return promise;
}
