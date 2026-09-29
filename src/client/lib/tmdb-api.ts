// Series and movies (TMDB), through this app's server: it holds the TMDB key and caches answers.
import type { CatalogPage, TmdbDetails, TmdbType } from '../../shared/catalog';
import type { AnimeMeta } from '../../shared/types';
import { AnimeApiError, type AnimeDetails, type BrowseParams, type BrowseResult } from './anime-api';

/** Shown where series and movies would be when the server has no TMDB key. */
export const TMDB_OFF =
  'Os filmes e as séries ainda não estão ativos neste servidor: falta a chave do TMDB (TMDB_API_KEY), que quem gere a app tem de configurar.';

const MESSAGES: Record<string, string> = {
  tmdb_not_configured: TMDB_OFF,
  tmdb_key_invalid: 'O TMDB recusou a chave deste servidor (TMDB_API_KEY). Quem gere o servidor tem de a confirmar.',
  tmdb_unreachable: 'O servidor não conseguiu contactar o TMDB. Tenta daqui a pouco.',
  not_found: 'Não encontrado no TMDB.',
  rate_limited: 'Demasiados pedidos ao TMDB. Tenta daqui a pouco.',
};

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new AnimeApiError('Sem ligação ao servidor.', 0);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    const code = data?.error ?? '';
    throw new AnimeApiError(MESSAGES[code] ?? `Erro ao carregar do TMDB (${res.status}).`, res.status, res.status === 429 ? 30 : 0);
  }
  return data;
}

let available: Promise<boolean> | null = null;

/** Whether this server offers series and movies (it needs a TMDB key). */
export function tmdbAvailable(): Promise<boolean> {
  available ??= get<{ tmdb: boolean }>('/api/catalogs').then(
    (r) => r.tmdb,
    () => {
      available = null;
      return false;
    },
  );
  return available;
}

const browseCache = new Map<string, Promise<BrowseResult>>();

export function browseTmdb(type: TmdbType, params: BrowseParams, page = 1): Promise<BrowseResult> {
  const qs = new URLSearchParams({ page: String(page) });
  if (params.search) qs.set('search', params.search);
  if (params.sort && params.sort !== 'relevance' && params.sort !== 'favourites') qs.set('sort', params.sort);
  if (params.genre) qs.set('genre', params.genre);
  if (params.year) qs.set('year', String(params.year));
  const url = `/api/tmdb/${type}?${qs}`;
  const hit = browseCache.get(url);
  if (hit) return hit;
  const promise = get<CatalogPage>(url).then((r) => ({ ...r, source: 'tmdb' as const }));
  browseCache.set(url, promise);
  promise.catch(() => browseCache.delete(url));
  if (browseCache.size > 80) browseCache.delete(browseCache.keys().next().value!);
  return promise;
}

const detailsCache = new Map<string, Promise<AnimeDetails>>();

export function tmdbDetails(meta: AnimeMeta): Promise<AnimeDetails> {
  const type: TmdbType = meta.key.startsWith('tv:') ? 'tv' : 'movie';
  const hit = detailsCache.get(meta.key);
  if (hit) return hit;
  const promise = get<TmdbDetails>(`/api/tmdb/${type}/${meta.sourceId}`).then(
    (d): AnimeDetails => ({
      meta: d.meta,
      coverLarge: d.coverLarge,
      synopsis: d.synopsis,
      duration: d.duration,
      source: null,
      endYear: d.endYear,
      trailerUrl: d.trailerUrl,
      tags: [],
      nextEpisode: null,
      recommendations: d.recommendations,
      seasons: d.seasons,
      cast: d.cast,
      creators: d.creators,
    }),
  );
  detailsCache.set(meta.key, promise);
  promise.catch(() => detailsCache.delete(meta.key));
  return promise;
}
