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
