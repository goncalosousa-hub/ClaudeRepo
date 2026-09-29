import type { AnimeMeta } from '../src/shared/types';

export function anime(id: number, title = `Anime ${id}`, extra: Partial<AnimeMeta> = {}): AnimeMeta {
  return {
    key: `al:${id}`,
    source: 'anilist',
    sourceId: id,
    idMal: id + 10_000,
    title,
    titleEnglish: null,
    titleNative: null,
    cover: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx${id}.jpg`,
    color: '#e4a15d',
    banner: null,
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    year: 2020,
    season: 'FALL',
    genres: ['Action', 'Drama'],
    score: 80,
    studio: 'Studio',
    synopsis: 'Synopsis',
    url: `https://anilist.co/anime/${id}`,
    ...extra,
  };
}

/** A TMDB series ("tv:<id>") or movie ("mv:<id>"). */
export function title(type: 'tv' | 'movie', id: number, name = `Title ${id}`, extra: Partial<AnimeMeta> = {}): AnimeMeta {
  return {
    key: `${type === 'tv' ? 'tv' : 'mv'}:${id}`,
    source: 'tmdb',
    sourceId: id,
    idMal: null,
    title: name,
    titleEnglish: null,
    titleNative: null,
    cover: `https://image.tmdb.org/t/p/w342/poster${id}.jpg`,
    color: null,
    banner: null,
    format: type === 'tv' ? 'SERIES' : 'MOVIE',
    status: null,
    episodes: null,
    year: 2010,
    season: null,
    genres: ['Drama'],
    score: 85,
    studio: null,
    synopsis: 'Synopsis',
    url: `https://www.themoviedb.org/${type}/${id}`,
    ...extra,
  };
}

/** An Open Library book ("bk:<work number>"). */
export function book(id: number, name = `Livro ${id}`, extra: Partial<AnimeMeta> = {}): AnimeMeta {
  return {
    key: `bk:${id}`,
    source: 'openlibrary',
    sourceId: id,
    idMal: null,
    title: name,
    titleEnglish: null,
    titleNative: null,
    cover: `https://covers.openlibrary.org/b/id/${id}-L.jpg`,
    color: null,
    banner: null,
    format: 'BOOK',
    status: null,
    episodes: 300,
    year: 1888,
    season: null,
    genres: ['Fiction'],
    score: null,
    studio: 'Eça de Queirós',
    synopsis: '',
    url: `https://openlibrary.org/works/OL${id}W`,
    ...extra,
  };
}

/**
 * A restaurant ("rs:") or place ("pl:"): from OpenStreetMap with a numeric id ("n<id>"), or added by
 * hand with a string id ("x" + 10 characters).
 */
export function spot(
  type: 'restaurant' | 'place',
  id: number | string,
  name = `Sítio ${id}`,
  city: string | null = 'Leiria',
  extra: Partial<AnimeMeta> = {},
): AnimeMeta {
  const prefix = type === 'restaurant' ? 'rs' : 'pl';
  const osm = typeof id === 'number';
  return {
    key: osm ? `${prefix}:n${id}` : `${prefix}:${id}`,
    source: osm ? 'osm' : 'user',
    sourceId: osm ? id : 0,
    idMal: null,
    title: name,
    titleEnglish: null,
    titleNative: null,
    cover: '',
    color: null,
    banner: null,
    format: type === 'restaurant' ? 'restaurant' : 'beach',
    status: null,
    episodes: null,
    year: null,
    season: null,
    genres: [],
    score: null,
    studio: null,
    synopsis: '',
    url: osm ? `https://www.openstreetmap.org/node/${id}` : null,
    place: { address: 'Rua Direita 1', city, lat: osm ? 39.74 : null, lon: osm ? -8.8 : null },
    ...extra,
  };
}
