// Portuguese words for what a room holds ("anime", "série", "filme", "livro"…), with their gender.
import type { MediaType, RoomKind } from '../../shared/types';

export interface Noun {
  one: string;
  many: string;
  /** Feminine ("uma série") */
  f: boolean;
}

const NOUNS: Record<MediaType | 'title', Noun> = {
  anime: { one: 'anime', many: 'animes', f: false },
  tv: { one: 'série', many: 'séries', f: true },
  movie: { one: 'filme', many: 'filmes', f: false },
  book: { one: 'livro', many: 'livros', f: false },
  restaurant: { one: 'restaurante', many: 'restaurantes', f: false },
  place: { one: 'sítio', many: 'sítios', f: false },
  title: { one: 'título', many: 'títulos', f: false },
};

export const mediaNoun = (media: MediaType): Noun => NOUNS[media];

const KIND_NOUNS: Record<RoomKind, Noun> = {
  anime: NOUNS.anime,
  series: NOUNS.tv,
  movies: NOUNS.movie,
  all: NOUNS.title,
  books: NOUNS.book,
  restaurants: NOUNS.restaurant,
  places: NOUNS.place,
};

/** What the room holds, e.g. "séries"; "títulos" when it mixes anime, series and movies. */
export const kindNoun = (kind: RoomKind): Noun => KIND_NOUNS[kind];

/** "um" / "uma" */
export const an = (n: Noun) => (n.f ? 'uma' : 'um');
/** "Nenhum" / "Nenhuma" */
export const none = (n: Noun) => (n.f ? 'Nenhuma' : 'Nenhum');
/** "Todos os" / "Todas as" */
export const allThe = (n: Noun) => (n.f ? 'Todas as' : 'Todos os');
/** "Este" / "Esta" */
export const thisOne = (n: Noun) => (n.f ? 'Esta' : 'Este');
/** Agreement of a participle: added("adicionad", série) → "adicionada" */
export const agree = (stem: string, n: Noun) => `${stem}${n.f ? 'a' : 'o'}`;

/**
 * Room types, in the order they are offered: films, series and anime together first, then each of
 * them, then books, restaurants and places.
 */
export const KINDS: { id: RoomKind; label: string; emoji: string; about: string }[] = [
  { id: 'all', label: 'Filmes e séries', emoji: '🍿', about: 'Filmes, séries e anime na mesma sala.' },
  { id: 'movies', label: 'Filmes', emoji: '🎬', about: 'Só filmes.' },
  { id: 'series', label: 'Séries', emoji: '📺', about: 'Só séries.' },
  { id: 'anime', label: 'Anime', emoji: '🎌', about: 'Só anime.' },
  { id: 'books', label: 'Livros', emoji: '📚', about: 'Livros de todo o mundo (Open Library).' },
  { id: 'restaurants', label: 'Restaurantes', emoji: '🍽️', about: 'Restaurantes, cafés e bares, com fotos.' },
  { id: 'places', label: 'Sítios', emoji: '📍', about: 'Praias, trilhos, miradouros, museus… com fotos.' },
];

export const MEDIA_TABS: Record<MediaType, { label: string; emoji: string }> = {
  anime: { label: 'Anime', emoji: '🎌' },
  tv: { label: 'Séries', emoji: '📺' },
  movie: { label: 'Filmes', emoji: '🎬' },
  book: { label: 'Livros', emoji: '📚' },
  restaurant: { label: 'Restaurantes', emoji: '🍽️' },
  place: { label: 'Sítios', emoji: '📍' },
};

export const kindInfo = (kind: RoomKind) => KINDS.find((k) => k.id === kind) ?? KINDS.find((k) => k.id === 'anime')!;

const RECOMMEND_WHAT: Record<RoomKind, string> = {
  all: 'um filme, série ou anime',
  movies: 'um filme',
  series: 'uma série',
  anime: 'um anime',
  books: 'um livro',
  restaurants: 'um restaurante',
  places: 'um sítio',
};

/** "Recomendar um restaurante" */
export const recommendLabel = (kind: RoomKind) => `Recomendar ${RECOMMEND_WHAT[kind]}`;

/** Words for where things happen: a room ("sala") or the community space ("comunidade"). */
export interface Place {
  /** "sala" / "comunidade" */
  name: string;
  /** "A sala" / "A comunidade" */
  The: string;
  /** "na sala" / "na comunidade" */
  in: string;
  /** "Na sala" / "Na comunidade" */
  In: string;
  /** "à sala" / "à comunidade" */
  to: string;
  /** "da sala" / "da comunidade" */
  from: string;
}

export function placeWords(global: boolean): Place {
  const name = global ? 'comunidade' : 'sala';
  return { name, The: `A ${name}`, in: `na ${name}`, In: `Na ${name}`, to: `à ${name}`, from: `da ${name}` };
}
