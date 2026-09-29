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

// ---------------------------------------------------------------------------
// Books (Open Library)

/** How the books catalogue can be browsed (besides searching). */
export type BookSort = 'trending' | 'popularity' | 'portuguese' | 'score' | 'newest';

/** Subjects offered in the books filter: id, Open Library subject, label. */
export const BOOK_SUBJECTS: { id: string; subject: string; label: string }[] = [
  { id: 'fantasy', subject: 'fantasy', label: 'Fantasia' },
  { id: 'scifi', subject: 'science fiction', label: 'Ficção científica' },
  { id: 'romance', subject: 'romance', label: 'Romance' },
  { id: 'mystery', subject: 'mystery and detective stories', label: 'Policial' },
  { id: 'thriller', subject: 'thrillers', label: 'Thriller' },
  { id: 'horror', subject: 'horror', label: 'Terror' },
  { id: 'history', subject: 'history', label: 'História' },
  { id: 'biography', subject: 'biography', label: 'Biografias' },
  { id: 'poetry', subject: 'poetry', label: 'Poesia' },
  { id: 'comics', subject: 'comics', label: 'Banda desenhada' },
  { id: 'children', subject: 'children', label: 'Infantil' },
  { id: 'selfhelp', subject: 'self-help', label: 'Autoajuda' },
  { id: 'business', subject: 'business', label: 'Negócios' },
  { id: 'classics', subject: 'classics', label: 'Clássicos' },
];

export interface BookDetails {
  meta: AnimeMeta;
  /** Empty when the book has no cover */
  coverLarge: string;
  synopsis: string;
  subjects: string[];
}

// ---------------------------------------------------------------------------
// Restaurants and places (OpenStreetMap, through Photon)

export type PlaceType = 'restaurant' | 'place';

/** OpenStreetMap kinds of restaurants and places, as shown in the app. */
export const PLACE_KINDS: Record<string, string> = {
  restaurant: 'Restaurante',
  cafe: 'Café',
  fast_food: 'Comida rápida',
  bar: 'Bar',
  pub: 'Pub',
  ice_cream: 'Gelataria',
  food_court: 'Praça de alimentação',
  bakery: 'Pastelaria',
  attraction: 'Atração',
  museum: 'Museu',
  viewpoint: 'Miradouro',
  artwork: 'Arte pública',
  gallery: 'Galeria',
  zoo: 'Jardim zoológico',
  theme_park: 'Parque temático',
  aquarium: 'Aquário',
  picnic_site: 'Parque de merendas',
  beach: 'Praia',
  peak: 'Pico',
  waterfall: 'Cascata',
  cave_entrance: 'Gruta',
  park: 'Parque',
  garden: 'Jardim',
  nature_reserve: 'Reserva natural',
  water_park: 'Parque aquático',
  national_park: 'Parque natural',
  protected_area: 'Área protegida',
  castle: 'Castelo',
  monument: 'Monumento',
  ruins: 'Ruínas',
  church: 'Igreja',
  city: 'Cidade',
  town: 'Vila',
  village: 'Aldeia',
  theatre: 'Teatro',
  arts_centre: 'Centro cultural',
  cinema: 'Cinema',
  other: 'Outro',
};
