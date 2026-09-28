// One entry point for every catalogue: anime (AniList / MyAnimeList) and series / movies (TMDB).
import { TMDB_GENRE_FILTERS } from '../../shared/catalog';
import { mediaTypeOf } from '../../shared/media';
import type { AnimeMeta, MediaType } from '../../shared/types';
import { animeDetails, browseAnime, type AnimeDetails, type BrowseParams, type BrowseResult, type SortKey } from './anime-api';
import { browseTmdb, tmdbDetails } from './tmdb-api';

export function browseCatalog(media: MediaType, params: BrowseParams, page = 1): Promise<BrowseResult> {
  return media === 'anime' ? browseAnime(params, page) : browseTmdb(media, params, page);
}

export function titleDetails(meta: AnimeMeta): Promise<AnimeDetails> {
  return mediaTypeOf(meta.key) === 'anime' ? animeDetails(meta) : tmdbDetails(meta);
}

export const catalogName = (media: MediaType) => (media === 'anime' ? 'AniList' : 'TMDB');

/** Genre filter of the series and movies catalogues (TMDB genre ids). */
export const tmdbGenres = (media: 'tv' | 'movie') => TMDB_GENRE_FILTERS[media];

export const TMDB_SORTS: { id: SortKey; label: string }[] = [
  { id: 'score', label: 'Melhor pontuação' },
  { id: 'newest', label: 'Mais recentes' },
];

/** Quick ways to browse series and movies (chips above the results). */
export const TMDB_PRESETS: Record<'tv' | 'movie', { label: string; sort: SortKey }[]> = {
  tv: [
    { label: '🔥 Em alta', sort: 'trending' },
    { label: '📡 Em exibição', sort: 'airing' },
    { label: '🏆 Melhores de sempre', sort: 'score' },
    { label: '👑 Mais populares', sort: 'popularity' },
  ],
  movie: [
    { label: '🔥 Em alta', sort: 'trending' },
    { label: '🍿 Nos cinemas', sort: 'airing' },
    { label: '📅 Brevemente', sort: 'upcoming' },
    { label: '🏆 Melhores de sempre', sort: 'score' },
    { label: '👑 Mais populares', sort: 'popularity' },
  ],
};

export const SEARCH_EXAMPLES: Record<MediaType, string> = {
  anime: 'Ex.: Frieren, One Piece, Shingeki no Kyojin…',
  tv: 'Ex.: Breaking Bad, Dark, The Office…',
  movie: 'Ex.: Interstellar, O Padrinho, Parasitas…',
};
