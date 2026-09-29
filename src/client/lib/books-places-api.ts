// Books (Open Library) and restaurants / places (OpenStreetMap), through this app's server, which
// caches the answers for everyone.
import type { BookDetails, CatalogPage, PlaceType } from '../../shared/catalog';
import type { AnimeMeta } from '../../shared/types';
import { AnimeApiError, type AnimeDetails, type BrowseParams, type BrowseResult } from './anime-api';

const MESSAGES: Record<string, string> = {
  books_unreachable: 'O servidor não conseguiu contactar a Open Library. Tenta daqui a pouco.',
  places_unreachable: 'O servidor não conseguiu contactar o mapa (OpenStreetMap). Tenta daqui a pouco.',
  rate_limited: 'Demasiados pedidos. Tenta daqui a pouco.',
  not_found: 'Não encontrado.',
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
    throw new AnimeApiError(MESSAGES[data?.error ?? ''] ?? `Erro ao carregar o catálogo (${res.status}).`, res.status, res.status === 429 ? 30 : 0);
  }
  return data;
}

const cache = new Map<string, Promise<unknown>>();
function cached<T>(url: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(url) as Promise<T> | undefined;
  if (hit) return hit;
  const promise = load();
  cache.set(url, promise);
  promise.catch(() => cache.delete(url));
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
  return promise;
}

export function browseBooks(params: BrowseParams, page = 1): Promise<BrowseResult> {
  const qs = new URLSearchParams({ page: String(page) });
  if (params.search) qs.set('search', params.search);
  if (params.sort && ['trending', 'popularity', 'portuguese', 'score', 'newest'].includes(params.sort)) qs.set('sort', params.sort);
  if (params.genre) qs.set('subject', params.genre);
  const url = `/api/books?${qs}`;
  return cached(url, () => get<CatalogPage>(url).then((r) => ({ ...r, source: 'openlibrary' as const })));
}

export function bookDetails(meta: AnimeMeta): Promise<AnimeDetails> {
  const url = `/api/books/${meta.sourceId}`;
  return cached(url, () =>
    get<BookDetails>(url).then(
      (d): AnimeDetails => ({
        meta: d.meta,
        coverLarge: d.coverLarge,
        synopsis: d.synopsis,
        duration: null,
        source: null,
        endYear: null,
        trailerUrl: null,
        tags: d.subjects,
        nextEpisode: null,
        recommendations: [],
      }),
    ),
  );
}

/** Restaurants or places on the map; an empty search gives nothing (there is no "trending" on a map). */
export function searchPlaces(type: PlaceType, params: BrowseParams): Promise<BrowseResult> {
  const search = params.search?.trim() ?? '';
  if (search.length < 2) return Promise.resolve({ items: [], hasNext: false, total: 0, source: 'osm' });
  const url = `/api/places/${type}?${new URLSearchParams({ search })}`;
  return cached(url, () => get<CatalogPage>(url).then((r) => ({ ...r, source: 'osm' as const })));
}
