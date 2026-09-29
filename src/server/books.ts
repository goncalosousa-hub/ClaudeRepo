// Books catalogue: Open Library (https://openlibrary.org), free and without a key. The browsers go
// through this server so the answers are cached for everyone (and Open Library gets fewer requests).
import { LIMITS } from '../shared/constants';
import { BOOK_SUBJECTS, type BookDetails, type BookSort, type CatalogPage } from '../shared/catalog';
import type { AnimeMeta } from '../shared/types';

const COVERS = 'https://covers.openlibrary.org/b/id';
const BROWSE_TTL = 30 * 60_000;
const DETAILS_TTL = 12 * 60 * 60_000;
const MAX_CACHE = 500;
const PAGE_SIZE = 20;
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,ratings_average,ratings_count';
// Open Library asks apps to say who they are.
const USER_AGENT = 'LusiHub (https://github.com/goncalosousa-hub/ClaudeRepo)';

export interface BooksOptions {
  /** For tests: another server that speaks the Open Library API */
  baseUrl?: string;
}

export interface BookBrowseParams {
  page: number;
  search?: string;
  sort?: BookSort;
  /** One of BOOK_SUBJECTS */
  subject?: string;
}

export type BooksErrorCode = 'books_unreachable' | 'rate_limited' | 'not_found' | 'books_error';

export class BooksError extends Error {
  constructor(readonly code: BooksErrorCode) {
    super(code);
    this.name = 'BooksError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
const WORK_KEY = /^\/works\/OL(\d{1,9})W$/;

/** Subjects are free text ("Fiction, historical, general"): the app's genres they mention. */
const GENRE_WORDS: [RegExp, string][] = [
  [/science fiction|ficção científica/i, 'Sci-Fi'],
  [/fantasy|fantasia/i, 'Fantasy'],
  [/romance|love stories/i, 'Romance'],
  [/detective|mystery|policial/i, 'Mystery'],
  [/crime/i, 'Crime'],
  [/thriller|suspense/i, 'Thriller'],
  [/horror|terror/i, 'Horror'],
  [/histor/i, 'History'],
  [/biograph/i, 'Biography'],
  [/poetry|poesia/i, 'Poetry'],
  [/comic|graphic novel|manga/i, 'Comics'],
  [/juvenile|children/i, 'Kids'],
  [/humor|comedy/i, 'Comedy'],
  [/philosoph/i, 'Philosophy'],
  [/self-help|autoajuda/i, 'Self-help'],
  [/business|economics/i, 'Business'],
  [/classic/i, 'Classics'],
  [/science|ciência/i, 'Science'],
];

function genresOf(subjects: unknown): string[] {
  const found = new Set<string>();
  for (const s of (Array.isArray(subjects) ? subjects : []).slice(0, 60)) {
    if (typeof s !== 'string') continue;
    for (const [re, genre] of GENRE_WORDS) if (re.test(s)) found.add(genre);
  }
  return [...found].slice(0, 8);
}

const yearOf = (y: unknown) => (Number.isInteger(y) && (y as number) > -3000 && (y as number) <= 2200 ? (y as number) : null);

/** An Open Library work (a search result) in the app's format. */
export function fromOpenLibrary(d: Json): AnimeMeta | null {
  const m = typeof d?.key === 'string' ? WORK_KEY.exec(d.key) : null;
  const title = typeof d?.title === 'string' ? d.title.trim() : '';
  if (!m || !title) return null;
  const id = Number(m[1]);
  const authors = (Array.isArray(d.author_name) ? d.author_name : []).filter((a: unknown) => typeof a === 'string').slice(0, 3);
  const cover = Number.isInteger(d.cover_i) && d.cover_i > 0 ? `${COVERS}/${d.cover_i}-M.jpg` : '';
  const pages = Number.isInteger(d.number_of_pages_median) && d.number_of_pages_median > 0 ? Math.min(d.number_of_pages_median, 100_000) : null;
  const votes = Number(d.ratings_count) || 0;
  const average = Number(d.ratings_average) || 0;
  return {
    key: `bk:${id}`,
    source: 'openlibrary',
    sourceId: id,
    idMal: null,
    title: clip(title, 300),
    titleEnglish: null,
    titleNative: null,
    cover,
    color: null,
    banner: null,
    format: 'BOOK',
    status: null,
    episodes: pages,
    year: yearOf(d.first_publish_year),
    season: null,
    genres: genresOf(d.subject),
    // Ratings from 1 to 5; a 5/5 from 2 readers says nothing.
    score: votes >= 10 && average > 0 ? Math.min(100, Math.round(average * 20)) : null,
    studio: authors.length ? clip(authors.join(', '), 120) : null,
    synopsis: '',
    url: `https://openlibrary.org/works/OL${id}W`,
  };
}

/** The search Open Library answers a browse request with (or its "trending" list). */
export function bookRequest(p: BookBrowseParams): { path: string; query: Record<string, string> } {
  if (!p.search && !p.subject && (p.sort === 'trending' || !p.sort)) {
    return { path: '/trending/weekly.json', query: { limit: '40' } };
  }
  const q: string[] = [];
  if (p.search) q.push(p.search);
  const subject = BOOK_SUBJECTS.find((s) => s.id === p.subject);
  if (subject) q.push(`subject:"${subject.subject}"`);
  const query: Record<string, string> = { fields: FIELDS, limit: String(PAGE_SIZE), page: String(p.page), lang: 'pt' };
  if (p.sort === 'portuguese') q.push('language:por');
  if (p.sort === 'score') {
    query.sort = 'rating';
    if (!p.search) q.push('ratings_count:[50 TO *]');
  } else if (p.sort === 'newest') {
    query.sort = 'new';
    if (!p.search) q.push('ratings_count:[5 TO *]');
  } else if (!p.search) {
    // Most read first.
    query.sort = 'readinglog';
  }
  query.q = q.join(' ') || 'readinglog_count:[100 TO *]';
  return { path: '/search.json', query };
}

export class Books {
  private cache = new Map<string, { expires: number; value: Promise<Json> }>();
  private readonly baseUrl: string;

  constructor(opts: BooksOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://openlibrary.org').replace(/\/+$/, '');
  }

  private request(path: string, query: Record<string, string>, ttl: number): Promise<Json> {
    const url = `${this.baseUrl}${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;
    const hit = this.cache.get(url);
    if (hit && hit.expires > Date.now()) {
      this.cache.delete(url);
      this.cache.set(url, hit);
      return hit.value;
    }
    const value = (async () => {
      let res: Response;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(12_000) });
      } catch {
        throw new BooksError('books_unreachable');
      }
      if (res.status === 404) throw new BooksError('not_found');
      if (res.status === 429) throw new BooksError('rate_limited');
      if (!res.ok) throw new BooksError('books_error');
      try {
        return (await res.json()) as Json;
      } catch {
        throw new BooksError('books_error');
      }
    })();
    const entry = { expires: Date.now() + ttl, value };
    this.cache.set(url, entry);
    value.catch(() => {
      if (this.cache.get(url) === entry) this.cache.delete(url);
    });
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  async browse(p: BookBrowseParams): Promise<CatalogPage> {
    const { path, query } = bookRequest(p);
    const data = await this.request(path, query, BROWSE_TTL);
    const docs: Json[] = Array.isArray(data?.docs) ? data.docs : Array.isArray(data?.works) ? data.works : [];
    const seen = new Set<string>();
    const items = docs
      .map(fromOpenLibrary)
      .filter((m): m is AnimeMeta => m !== null && !seen.has(m.key) && !!seen.add(m.key));
    const total = Number.isInteger(data?.numFound) ? (data.numFound as number) : null;
    return { items, hasNext: path === '/search.json' && total != null && p.page * PAGE_SIZE < Math.min(total, 1000), total };
  }

  async details(id: number): Promise<BookDetails> {
    const [found, work] = await Promise.all([
      this.request('/search.json', { q: `key:/works/OL${id}W`, fields: FIELDS, limit: '1', lang: 'pt' }, DETAILS_TTL),
      this.request(`/works/OL${id}W.json`, {}, DETAILS_TTL),
    ]);
    const meta = fromOpenLibrary(found?.docs?.[0]) ?? fromOpenLibrary({ ...work, key: `/works/OL${id}W` });
    if (!meta) throw new BooksError('not_found');
    const raw = typeof work?.description === 'string' ? work.description : typeof work?.description?.value === 'string' ? work.description.value : '';
    // Descriptions often end with links and notes after a "----" line.
    const synopsis = raw.split(/\r?\n-{3,}/)[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    const coverId = Number.isInteger(work?.covers?.[0]) && work.covers[0] > 0 ? work.covers[0] : null;
    const subjects = (Array.isArray(work?.subjects) ? work.subjects : []).filter((s: unknown) => typeof s === 'string').slice(0, 12);
    const withGenres = meta.genres.length ? meta : { ...meta, genres: genresOf(subjects) };
    return {
      meta: { ...withGenres, synopsis: clip(synopsis, LIMITS.synopsis), cover: meta.cover || (coverId ? `${COVERS}/${coverId}-M.jpg` : '') },
      coverLarge: meta.cover ? meta.cover.replace(/-M\.jpg$/, '-L.jpg') : coverId ? `${COVERS}/${coverId}-L.jpg` : '',
      synopsis,
      subjects,
    };
  }
}
