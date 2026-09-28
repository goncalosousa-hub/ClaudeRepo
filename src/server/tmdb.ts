// Series and movies catalogue: The Movie Database (https://www.themoviedb.org). It needs a free API
// key (TMDB_API_KEY), so the browsers go through this server: the key never leaves it, and the
// answers are cached for everyone.
import { LIMITS } from '../shared/constants';
import { TMDB_GENRES, type CatalogPage, type TmdbDetails, type TmdbSort, type TmdbType } from '../shared/catalog';
import type { AnimeMeta } from '../shared/types';

const IMG = 'https://image.tmdb.org/t/p';
const LANGUAGE = 'pt-PT';
const REGION = 'PT';
const BROWSE_TTL = 15 * 60_000;
const DETAILS_TTL = 6 * 60 * 60_000;
const MAX_CACHE = 500;

export interface TmdbOptions {
  /** API key (v3) or API Read Access Token (v4) */
  key?: string;
  /** For tests: another server that speaks the TMDB API */
  baseUrl?: string;
}

export interface TmdbBrowseParams {
  type: TmdbType;
  page: number;
  search?: string;
  sort?: TmdbSort;
  /** TMDB genre id */
  genre?: number;
  year?: number;
}

export type TmdbErrorCode =
  | 'tmdb_not_configured'
  | 'tmdb_key_invalid'
  | 'tmdb_unreachable'
  | 'rate_limited'
  | 'not_found'
  | 'tmdb_error';

export class TmdbError extends Error {
  constructor(readonly code: TmdbErrorCode) {
    super(code);
    this.name = 'TmdbError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

/** Letters of other scripts (Korean, Japanese, Cyrillic…): TMDB has no Portuguese title for it. */
const NON_LATIN = /[^\p{Script=Latin}\P{L}]/u;
const IMAGE_PATH = /^\/[A-Za-z0-9_.-]{1,100}$/;

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

function yearOf(date: unknown): number | null {
  const y = typeof date === 'string' ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y >= 1900 && y <= 2200 ? y : null;
}

function genresOf(r: Json): string[] {
  const ids: unknown[] = Array.isArray(r.genre_ids) ? r.genre_ids : Array.isArray(r.genres) ? r.genres.map((g: Json) => g?.id) : [];
  const names = new Set<string>();
  for (const id of ids) for (const g of TMDB_GENRES[id as number] ?? []) names.add(g);
  return [...names].slice(0, 20);
}

const STATUS: Record<string, string> = {
  'Returning Series': 'RELEASING',
  'In Production': 'NOT_YET_RELEASED',
  Planned: 'NOT_YET_RELEASED',
  Pilot: 'NOT_YET_RELEASED',
  'Post Production': 'NOT_YET_RELEASED',
  Rumored: 'NOT_YET_RELEASED',
  Ended: 'FINISHED',
  Released: 'FINISHED',
  Canceled: 'CANCELLED',
};

/** A TMDB series or movie in the app's format (null when it has no poster: it would look broken). */
export function fromTmdb(type: TmdbType, r: Json): AnimeMeta | null {
  const id = r?.id;
  if (!Number.isInteger(id) || id <= 0 || id > 999_999_999) return null;
  if (typeof r.poster_path !== 'string' || !IMAGE_PATH.test(r.poster_path)) return null;
  const original: string = String((type === 'tv' ? r.original_name : r.original_title) ?? '').trim();
  const title: string = String((type === 'tv' ? r.name : r.title) ?? '').trim() || original || `#${id}`;
  const votes = Number(r.vote_count) || 0;
  const average = Number(r.vote_average) || 0;
  return {
    key: `${type === 'tv' ? 'tv' : 'mv'}:${id}`,
    source: 'tmdb',
    sourceId: id,
    idMal: null,
    title: clip(title, 300),
    titleEnglish: null,
    titleNative: original && original !== title ? clip(original, 300) : null,
    cover: `${IMG}/w342${r.poster_path}`,
    color: null,
    banner: typeof r.backdrop_path === 'string' && IMAGE_PATH.test(r.backdrop_path) ? `${IMG}/w1280${r.backdrop_path}` : null,
    format: type === 'tv' ? 'SERIES' : 'MOVIE',
    status: STATUS[r.status] ?? null,
    episodes: type === 'tv' && Number.isInteger(r.number_of_episodes) && r.number_of_episodes <= 100_000 ? r.number_of_episodes : null,
    year: yearOf(type === 'tv' ? r.first_air_date : r.release_date),
    season: null,
    genres: genresOf(r),
    // A 10/10 from 3 votes says nothing.
    score: votes >= 20 && average > 0 ? Math.min(100, Math.round(average * 10)) : null,
    studio: null,
    synopsis: clip(String(r.overview ?? '').trim(), LIMITS.synopsis),
    url: `https://www.themoviedb.org/${type}/${id}`,
  };
}

const nameOf = (type: TmdbType, r: Json): string => String((type === 'tv' ? r?.name : r?.title) ?? '').trim();

/** No Portuguese title (only the original one, e.g. in Korean)? The English title reads better. */
function withEnglishTitle(meta: AnimeMeta, english: string | undefined): AnimeMeta {
  if (!english || !NON_LATIN.test(meta.title) || NON_LATIN.test(english)) return meta;
  return { ...meta, title: clip(english, 300), titleNative: meta.titleNative ?? meta.title };
}

/** Which TMDB endpoint answers a browse request. */
export function browseRequest(
  p: TmdbBrowseParams,
  today: string,
): { path: string; query: Record<string, string>; genre?: number } {
  const t = p.type;
  const query: Record<string, string> = { page: String(p.page) };
  const yearField = t === 'tv' ? 'first_air_date_year' : 'primary_release_year';
  if (p.search) {
    query.query = p.search;
    query.include_adult = 'false';
    if (p.year) query[yearField] = String(p.year);
    // The search endpoint has no genre filter: the results are filtered here.
    return { path: `/search/${t}`, query, genre: p.genre };
  }
  if (p.genre == null && p.year == null) {
    if (p.sort === 'trending') return { path: `/trending/${t}/week`, query };
    if (p.sort === 'airing') {
      return t === 'tv' ? { path: '/tv/on_the_air', query } : { path: '/movie/now_playing', query: { ...query, region: REGION } };
    }
    if (p.sort === 'upcoming' && t === 'movie') return { path: '/movie/upcoming', query: { ...query, region: REGION } };
  }
  const dateField = t === 'tv' ? 'first_air_date' : 'primary_release_date';
  query.include_adult = 'false';
  query.sort_by = p.sort === 'score' ? 'vote_average.desc' : p.sort === 'newest' ? `${dateField}.desc` : 'popularity.desc';
  if (p.sort === 'score') query['vote_count.gte'] = p.year ? (t === 'tv' ? '50' : '200') : t === 'tv' ? '200' : '1000';
  if (p.sort === 'newest') {
    query[`${dateField}.lte`] = today;
    query['vote_count.gte'] = '20';
  }
  if (p.genre != null) query.with_genres = String(p.genre);
  if (p.year != null) query[yearField] = String(p.year);
  return { path: `/discover/${t}`, query };
}

function trailerOf(d: Json): string | null {
  const videos = ((d.videos?.results ?? []) as Json[]).filter(
    (v) => v?.site === 'YouTube' && typeof v.key === 'string' && /^[\w-]{6,20}$/.test(v.key),
  );
  const rank = (v: Json) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 2 : 4) + (v.official ? 0 : 1) - (v.iso_639_1 === 'pt' ? 0.5 : 0);
  const best = videos.filter((v) => v.type === 'Trailer' || v.type === 'Teaser').sort((a, b) => rank(a) - rank(b))[0];
  return best ? `https://www.youtube.com/watch?v=${best.key}` : null;
}

const names = (list: unknown, max: number): string[] =>
  (Array.isArray(list) ? list : [])
    .map((p: Json) => (typeof p?.name === 'string' ? p.name.trim() : ''))
    .filter(Boolean)
    .slice(0, max);

export class Tmdb {
  private cache = new Map<string, { expires: number; value: Promise<Json> }>();
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(opts: TmdbOptions = {}) {
    this.key = opts.key?.trim() ?? '';
    this.baseUrl = (opts.baseUrl ?? 'https://api.themoviedb.org/3').replace(/\/+$/, '');
  }

  get configured() {
    return this.key !== '';
  }

  private request(path: string, query: Record<string, string>, ttl: number): Promise<Json> {
    if (!this.key) return Promise.reject(new TmdbError('tmdb_not_configured'));
    const cacheKey = `${path}?${new URLSearchParams(query)}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      // Most recently used entries are kept longest.
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit);
      return hit.value;
    }
    // The v4 "API Read Access Token" is a JWT sent as a header; the v3 key goes in the URL.
    const bearer = this.key.startsWith('eyJ');
    const qs = new URLSearchParams(query);
    if (!bearer) qs.set('api_key', this.key);
    const value = (async () => {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}?${qs}`, {
          headers: { Accept: 'application/json', ...(bearer ? { Authorization: `Bearer ${this.key}` } : {}) },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new TmdbError('tmdb_unreachable');
      }
      if (res.status === 401) throw new TmdbError('tmdb_key_invalid');
      if (res.status === 404) throw new TmdbError('not_found');
      if (res.status === 429) throw new TmdbError('rate_limited');
      if (!res.ok) throw new TmdbError('tmdb_error');
      try {
        return (await res.json()) as Json;
      } catch {
        throw new TmdbError('tmdb_error');
      }
    })();
    const entry = { expires: Date.now() + ttl, value };
    this.cache.set(cacheKey, entry);
    value.catch(() => {
      if (this.cache.get(cacheKey) === entry) this.cache.delete(cacheKey);
    });
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  async browse(p: TmdbBrowseParams): Promise<CatalogPage> {
    const { path, query, genre } = browseRequest(p, new Date().toISOString().slice(0, 10));
    const data = await this.request(path, { ...query, language: LANGUAGE }, BROWSE_TTL);
    let results: Json[] = Array.isArray(data?.results) ? data.results : [];
    if (genre != null) results = results.filter((r) => Array.isArray(r?.genre_ids) && r.genre_ids.includes(genre));
    let items = results.map((r) => fromTmdb(p.type, r)).filter((m): m is AnimeMeta => m !== null);
    if (items.some((m) => NON_LATIN.test(m.title))) {
      const en = await this.request(path, { ...query, language: 'en-US' }, BROWSE_TTL).catch(() => null);
      const english = new Map<number, string>(((en?.results ?? []) as Json[]).map((r) => [r?.id, nameOf(p.type, r)]));
      items = items.map((m) => withEnglishTitle(m, english.get(m.sourceId)));
    }
    const totalPages = Math.min(Number(data?.total_pages) || 1, 500);
    return {
      items,
      hasNext: p.page < totalPages,
      total: Number.isFinite(data?.total_results) ? data.total_results : null,
    };
  }

  async details(type: TmdbType, id: number): Promise<TmdbDetails> {
    const path = `/${type}/${id}`;
    const d = await this.request(
      path,
      { append_to_response: 'videos,recommendations,credits', include_video_language: 'pt,en,null', language: LANGUAGE },
      DETAILS_TTL,
    );
    let meta = fromTmdb(type, d);
    if (!meta) throw new TmdbError('not_found');
    let synopsis = String(d.overview ?? '').trim();
    // Missing Portuguese translation: English title and synopsis.
    if (NON_LATIN.test(meta.title) || !synopsis) {
      const en = await this.request(path, { language: 'en-US' }, DETAILS_TTL).catch(() => null);
      if (en) {
        meta = withEnglishTitle(meta, nameOf(type, en));
        synopsis ||= String(en.overview ?? '').trim();
      }
    }
    const directors = ((d.credits?.crew ?? []) as Json[]).filter((c) => c?.job === 'Director');
    const studio = type === 'tv' ? (names(d.networks, 1)[0] ?? null) : names(directors, 2).join(', ') || null;
    const runtime = type === 'movie' ? d.runtime : (d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime);
    const ended = d.status === 'Ended' || d.status === 'Canceled';
    return {
      meta: { ...meta, studio: studio && clip(studio, 120), synopsis: clip(synopsis, LIMITS.synopsis) },
      coverLarge: `${IMG}/w780${d.poster_path}`,
      synopsis,
      duration: Number.isInteger(runtime) && runtime > 0 ? runtime : null,
      seasons: type === 'tv' && Number.isInteger(d.number_of_seasons) ? d.number_of_seasons : null,
      endYear: type === 'tv' && ended ? yearOf(d.last_air_date) : null,
      trailerUrl: trailerOf(d),
      cast: names(d.credits?.cast, 6),
      creators: type === 'tv' ? names(d.created_by, 3) : [],
      recommendations: ((d.recommendations?.results ?? []) as Json[])
        .map((r) => fromTmdb(type, r))
        .filter((m): m is AnimeMeta => m !== null)
        .slice(0, 12),
    };
  }
}
