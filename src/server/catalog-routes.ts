import express, { type Response } from 'express';
import { z } from 'zod';
import { rateLimit } from './http';
import { TmdbError, type Tmdb } from './tmdb';
import { BooksError, type Books } from './books';
import { PlacesError, type Places } from './places';
import { BOOK_SUBJECTS } from '../shared/catalog';

const browseQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  sort: z.enum(['popularity', 'trending', 'score', 'newest', 'airing', 'upcoming']).optional(),
  genre: z.coerce.number().int().positive().max(1_000_000).optional(),
  year: z.coerce.number().int().min(1870).max(2100).optional(),
});

const bookQuery = z.object({
  page: z.coerce.number().int().min(1).max(50).default(1),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  sort: z.enum(['trending', 'popularity', 'portuguese', 'score', 'newest']).optional(),
  subject: z
    .string()
    .optional()
    .refine((v) => v === undefined || BOOK_SUBJECTS.some((s) => s.id === v)),
});

const placeQuery = z.object({ search: z.string().trim().min(2).max(100) });

const STATUS: Record<TmdbError['code'] | BooksError['code'] | PlacesError['code'], number> = {
  tmdb_not_configured: 503,
  tmdb_key_invalid: 503,
  tmdb_unreachable: 502,
  books_unreachable: 502,
  places_unreachable: 502,
  rate_limited: 429,
  not_found: 404,
  tmdb_error: 502,
  books_error: 502,
  places_error: 502,
};

/**
 * Series and movies (TMDB), books (Open Library) and restaurants / places (OpenStreetMap) for the
 * browsers, plus which catalogues this server offers.
 */
export function catalogRouter(tmdb: Tmdb, books: Books, places: Places) {
  const router = express.Router();
  let warnedKey = false;

  const fail = (res: Response, err: unknown) => {
    if (err instanceof BooksError || err instanceof PlacesError) {
      res.status(STATUS[err.code]).json({ error: err.code });
      return;
    }
    if (!(err instanceof TmdbError)) throw err;
    if (err.code === 'tmdb_key_invalid' && !warnedKey) {
      warnedKey = true;
      console.warn('[tmdb] O TMDB recusou a chave em TMDB_API_KEY: confirma-a em https://www.themoviedb.org/settings/api');
    }
    res.status(STATUS[err.code]).json({ error: err.code });
  };

  router.get('/catalogs', (_req, res) => {
    res.json({ anime: true, tmdb: tmdb.configured, books: true, places: true });
  });

  router.get('/books', rateLimit(300, 60_000), async (req, res) => {
    const parsed = bookQuery.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: 'invalid_request' });
    try {
      res.json(await books.browse(parsed.data));
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/books/:id', rateLimit(300, 60_000), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || id > 999_999_999) return void res.status(400).json({ error: 'invalid_request' });
    try {
      res.json(await books.details(id));
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/places/:type', rateLimit(200, 60_000), async (req, res) => {
    const type = req.params.type;
    const parsed = placeQuery.safeParse(req.query);
    if ((type !== 'restaurant' && type !== 'place') || !parsed.success) return void res.status(400).json({ error: 'invalid_request' });
    try {
      res.json(await places.search(type, parsed.data.search));
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/tmdb/:type', rateLimit(300, 60_000), async (req, res) => {
    const type = req.params.type;
    const parsed = browseQuery.safeParse(req.query);
    if ((type !== 'tv' && type !== 'movie') || !parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.json(await tmdb.browse({ type, ...parsed.data }));
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/tmdb/:type/:id', rateLimit(300, 60_000), async (req, res) => {
    const { type } = req.params;
    const id = Number(req.params.id);
    if ((type !== 'tv' && type !== 'movie') || !Number.isInteger(id) || id <= 0 || id > 999_999_999) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.json(await tmdb.details(type, id));
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
