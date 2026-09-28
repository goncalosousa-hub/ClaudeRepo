// Series and movies catalogue (TMDB): genres and the answers of this server's /api/tmdb routes.
import type { AnimeMeta } from './types';

export type TmdbType = 'tv' | 'movie';

/**
 * TMDB genre id -> the genre names used in the app. They are the same names as AniList's where
 * the two overlap, so stats and filters work across anime, series and movies. TMDB's combined TV
 * genres ("Sci-Fi & Fantasy") count as both.
 */
export const TMDB_GENRES: Record<number, string[]> = {
  28: ['Action'],
  12: ['Adventure'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  99: ['Documentary'],
  18: ['Drama'],
  10751: ['Family'],
  14: ['Fantasy'],
  36: ['History'],
  27: ['Horror'],
  10402: ['Music'],
  9648: ['Mystery'],
  10749: ['Romance'],
  878: ['Sci-Fi'],
  10770: ['TV Movie'],
  53: ['Thriller'],
  10752: ['War'],
  37: ['Western'],
  10759: ['Action', 'Adventure'],
  10762: ['Kids'],
  10763: ['News'],
  10764: ['Reality'],
  10765: ['Sci-Fi', 'Fantasy'],
  10766: ['Soap'],
  10767: ['Talk'],
  10768: ['War', 'Politics'],
};

/** Genres offered in the filters (TMDB genre ids), in the order they are shown. */
export const TMDB_GENRE_FILTERS: Record<TmdbType, { id: number; label: string }[]> = {
  tv: [
    { id: 10759, label: 'Ação e aventura' },
    { id: 16, label: 'Animação' },
    { id: 35, label: 'Comédia' },
    { id: 80, label: 'Crime' },
    { id: 99, label: 'Documentário' },
    { id: 18, label: 'Drama' },
    { id: 10751, label: 'Família' },
    { id: 10765, label: 'Ficção científica e fantasia' },
    { id: 10768, label: 'Guerra e política' },
    { id: 10762, label: 'Infantil' },
    { id: 9648, label: 'Mistério' },
    { id: 10766, label: 'Novela' },
    { id: 10764, label: 'Reality show' },
    { id: 37, label: 'Western' },
  ],
  movie: [
    { id: 28, label: 'Ação' },
    { id: 12, label: 'Aventura' },
    { id: 16, label: 'Animação' },
    { id: 35, label: 'Comédia' },
    { id: 80, label: 'Crime' },
    { id: 99, label: 'Documentário' },
    { id: 18, label: 'Drama' },
    { id: 10751, label: 'Família' },
    { id: 14, label: 'Fantasia' },
    { id: 878, label: 'Ficção científica' },
    { id: 10752, label: 'Guerra' },
    { id: 36, label: 'História' },
    { id: 9648, label: 'Mistério' },
    { id: 10402, label: 'Música' },
    { id: 10749, label: 'Romance' },
    { id: 27, label: 'Terror' },
    { id: 53, label: 'Thriller' },
    { id: 37, label: 'Western' },
  ],
};

/** How a TMDB list can be browsed (besides searching). */
export type TmdbSort = 'popularity' | 'trending' | 'score' | 'newest' | 'airing' | 'upcoming';

export interface CatalogPage {
  items: AnimeMeta[];
  hasNext: boolean;
  total: number | null;
}

export interface TmdbDetails {
  meta: AnimeMeta;
  coverLarge: string;
  synopsis: string;
  /** Movie runtime or usual episode length, in minutes */
  duration: number | null;
  seasons: number | null;
  endYear: number | null;
  trailerUrl: string | null;
  /** Main cast */
  cast: string[];
  /** Series creators */
  creators: string[];
  recommendations: AnimeMeta[];
}
