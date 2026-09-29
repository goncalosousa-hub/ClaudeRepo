// One entry point for every catalogue: anime (AniList / MyAnimeList), series / movies (TMDB), books
// (Open Library) and restaurants / places (OpenStreetMap).
import { BOOK_SUBJECTS, TMDB_GENRE_FILTERS } from '../../shared/catalog';
import { mediaTypeOf } from '../../shared/media';
import type { AnimeMeta, MediaType } from '../../shared/types';
import { animeDetails, browseAnime, type AnimeDetails, type BrowseParams, type BrowseResult, type SortKey } from './anime-api';
import { bookDetails, browseBooks, searchPlaces } from './books-places-api';
import { browseTmdb, tmdbDetails } from './tmdb-api';

export function browseCatalog(media: MediaType, params: BrowseParams, page = 1): Promise<BrowseResult> {
  switch (media) {
    case 'anime':
      return browseAnime(params, page);
    case 'tv':
    case 'movie':
      return browseTmdb(media, params, page);
    case 'book':
      return browseBooks(params, page);
    case 'restaurant':
    case 'place':
      return searchPlaces(media, params);
  }
}

export function titleDetails(meta: AnimeMeta): Promise<AnimeDetails> {
  switch (mediaTypeOf(meta.key)) {
    case 'anime':
      return animeDetails(meta);
    case 'tv':
    case 'movie':
      return tmdbDetails(meta);
    case 'book':
      return bookDetails(meta);
    default:
      // Restaurants and places: everything is already in the room.
      return Promise.resolve({
        meta,
        coverLarge: meta.cover,
        synopsis: meta.synopsis,
        duration: null,
        source: null,
        endYear: null,
        trailerUrl: null,
        tags: [],
        nextEpisode: null,
        recommendations: [],
      });
  }
}

const CATALOG_NAMES: Record<MediaType, string> = {
  anime: 'AniList',
  tv: 'TMDB',
  movie: 'TMDB',
  book: 'Open Library',
  restaurant: 'OpenStreetMap',
  place: 'OpenStreetMap',
};
export const catalogName = (media: MediaType) => CATALOG_NAMES[media];

/** Book subjects offered in the filter. */
export const bookSubjects = BOOK_SUBJECTS;

/** Quick ways to browse books. */
export const BOOK_PRESETS: { label: string; sort: SortKey }[] = [
  { label: '🔥 Em alta', sort: 'trending' },
  { label: '🇵🇹 Em português', sort: 'portuguese' },
  { label: '👑 Mais lidos', sort: 'popularity' },
  { label: '🏆 Mais bem avaliados', sort: 'score' },
];

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
  book: 'Ex.: Os Maias, Saramago, Harry Potter…',
  restaurant: 'Ex.: Tasca do Zé, marisqueira Figueira da Foz…',
  place: 'Ex.: Praia da Tocha, Óbidos, Castelo de Leiria…',
};
