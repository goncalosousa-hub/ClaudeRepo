import express, { type Response } from 'express';
import { z } from 'zod';
import { rateLimit } from './http';
import { TmdbError, type Tmdb } from './tmdb';

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

const STATUS: Record<TmdbError['code'], number> = {
  tmdb_not_configured: 503,
  tmdb_key_invalid: 503,
  tmdb_unreachable: 502,
  rate_limited: 429,
  not_found: 404,
  tmdb_error: 502,
};

/** Series and movies (TMDB) for the browsers, plus which catalogues this server offers. */
export function catalogRouter(tmdb: Tmdb) {
  const router = express.Router();
  let warnedKey = false;

  const fail = (res: Response, err: unknown) => {
    if (!(err instanceof TmdbError)) throw err;
    if (err.code === 'tmdb_key_invalid' && !warnedKey) {
      warnedKey = true;
      console.warn('[tmdb] O TMDB recusou a chave em TMDB_API_KEY: confirma-a em https://www.themoviedb.org/settings/api');
    }
    res.status(STATUS[err.code]).json({ error: err.code });
  };

  router.get('/catalogs', (_req, res) => {
    res.json({ anime: true, tmdb: tmdb.configured });
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
