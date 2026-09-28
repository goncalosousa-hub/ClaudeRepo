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
