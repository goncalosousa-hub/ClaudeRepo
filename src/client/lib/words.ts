// Portuguese words for what a room holds ("anime", "série", "filme"…), with their gender.
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
  title: { one: 'título', many: 'títulos', f: false },
};

export const mediaNoun = (media: MediaType): Noun => NOUNS[media];

/** What the room holds, e.g. "séries"; "títulos" when it mixes anime, series and movies. */
export const kindNoun = (kind: RoomKind): Noun =>
  kind === 'series' ? NOUNS.tv : kind === 'movies' ? NOUNS.movie : kind === 'all' ? NOUNS.title : NOUNS.anime;

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

/** Room types, in the order they are offered: everything first, then films, series and anime. */
export const KINDS: { id: RoomKind; label: string; emoji: string }[] = [
  { id: 'all', label: 'Tudo', emoji: '✨' },
  { id: 'movies', label: 'Filmes', emoji: '🎬' },
  { id: 'series', label: 'Séries', emoji: '📺' },
  { id: 'anime', label: 'Anime', emoji: '🎌' },
];

export const MEDIA_TABS: Record<MediaType, { label: string; emoji: string }> = {
  anime: { label: 'Anime', emoji: '🎌' },
  tv: { label: 'Séries', emoji: '📺' },
  movie: { label: 'Filmes', emoji: '🎬' },
};

export const kindInfo = (kind: RoomKind) => KINDS.find((k) => k.id === kind) ?? KINDS.find((k) => k.id === 'anime')!;

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
