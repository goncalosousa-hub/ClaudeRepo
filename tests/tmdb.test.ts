import { afterEach, describe, expect, it } from 'vitest';
import { animeMetaSchema } from '../src/shared/schema';
import { Tmdb, TmdbError, browseRequest, fromTmdb } from '../src/server/tmdb';
import { FAKE_TMDB_KEY, FAKE_TMDB_TOKEN, startFakeTmdb } from './fake-tmdb';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function fake() {
  const server = await startFakeTmdb();
  cleanups.push(server.close);
  return { ...server, tmdb: new Tmdb({ key: FAKE_TMDB_KEY, baseUrl: server.url }) };
}

describe('TMDB titles', () => {
  it('turns a TMDB series or movie into a title the rooms accept', () => {
    const series = fromTmdb('tv', {
      id: 1399,
      name: 'A Guerra dos Tronos',
      original_name: 'Game of Thrones',
      poster_path: '/got.jpg',
      backdrop_path: '/got-wide.jpg',
      first_air_date: '2011-04-17',
      genre_ids: [10765, 18, 10759],
      vote_average: 8.46,
      vote_count: 25000,
      overview: 'Nove famílias nobres…',
    })!;
    expect(series).toMatchObject({
      key: 'tv:1399',
      source: 'tmdb',
      title: 'A Guerra dos Tronos',
      titleNative: 'Game of Thrones',
      cover: 'https://image.tmdb.org/t/p/w342/got.jpg',
      banner: 'https://image.tmdb.org/t/p/w1280/got-wide.jpg',
      format: 'SERIES',
      year: 2011,
      score: 85,
      url: 'https://www.themoviedb.org/tv/1399',
    });
    // Combined TMDB genres count as both, with the same names as the anime ones.
    expect(series.genres).toEqual(['Sci-Fi', 'Fantasy', 'Drama', 'Action', 'Adventure']);
    expect(animeMetaSchema.safeParse(series).success).toBe(true);

    const movie = fromTmdb('movie', { id: 238, title: 'O Padrinho', original_title: 'The Godfather', poster_path: '/p.jpg', release_date: '1972-03-14', vote_average: 8.7, vote_count: 3 })!;
    expect(movie).toMatchObject({ key: 'mv:238', format: 'MOVIE', year: 1972, score: null }); // too few votes
    expect(animeMetaSchema.safeParse(movie).success).toBe(true);

    // Without a poster (or with odd data) a title is left out.
    expect(fromTmdb('movie', { id: 1, title: 'Sem poster' })).toBeNull();
    expect(fromTmdb('movie', { id: 1, title: 'X', poster_path: 'https://evil.example/x.jpg' })).toBeNull();
    expect(fromTmdb('movie', { id: -4, title: 'X', poster_path: '/x.jpg' })).toBeNull();
    // Very old films: the year is dropped instead of failing validation.
    expect(fromTmdb('movie', { id: 2, title: 'Lumière', poster_path: '/l.jpg', release_date: '1895-12-28' })!.year).toBeNull();
  });

  it('picks the TMDB endpoint for each way of browsing', () => {
    const today = '2026-09-28';
    expect(browseRequest({ type: 'tv', page: 1, sort: 'trending' }, today)).toEqual({ path: '/trending/tv/week', query: { page: '1' } });
    expect(browseRequest({ type: 'tv', page: 2, sort: 'airing' }, today).path).toBe('/tv/on_the_air');
    expect(browseRequest({ type: 'movie', page: 1, sort: 'airing' }, today)).toMatchObject({ path: '/movie/now_playing', query: { region: 'PT' } });
    expect(browseRequest({ type: 'movie', page: 1, sort: 'upcoming' }, today).path).toBe('/movie/upcoming');
    // Filters need the discover endpoint, even for "trending".
    expect(browseRequest({ type: 'tv', page: 1, sort: 'trending', genre: 18 }, today)).toMatchObject({
      path: '/discover/tv',
      query: { with_genres: '18', sort_by: 'popularity.desc' },
    });
    expect(browseRequest({ type: 'movie', page: 1, sort: 'newest', year: 2024 }, today).query).toMatchObject({
      sort_by: 'primary_release_date.desc',
      'primary_release_date.lte': today,
      primary_release_year: '2024',
    });
    expect(browseRequest({ type: 'movie', page: 1, sort: 'score' }, today).query).toMatchObject({ sort_by: 'vote_average.desc', 'vote_count.gte': '1000' });
    expect(browseRequest({ type: 'tv', page: 1, search: 'dark', genre: 80, year: 2017 }, today)).toEqual({
      path: '/search/tv',
      query: { page: '1', query: 'dark', include_adult: 'false', first_air_date_year: '2017' },
      genre: 80,
    });
  });
});

describe('TMDB client', () => {
  it('browses with Portuguese titles, using the English one when there is no translation', async () => {
    const { tmdb, hits } = await fake();
    const page = await tmdb.browse({ type: 'tv', page: 1, sort: 'trending' });
    expect(page.hasNext).toBe(false);
    const titles = page.items.map((i) => i.title);
    expect(titles).toContain('A Guerra dos Tronos');
    const squid = page.items.find((i) => i.key === 'tv:93405')!;
    expect(squid).toMatchObject({ title: 'Squid Game', titleNative: '오징어 게임' });
    expect(hits.filter((h) => h.includes('trending'))).toHaveLength(2); // pt-PT + en-US

    // Cached: the same page again does not reach TMDB.
    await tmdb.browse({ type: 'tv', page: 1, sort: 'trending' });
    expect(hits.filter((h) => h.includes('trending'))).toHaveLength(2);

    const search = await tmdb.browse({ type: 'movie', page: 1, search: 'padrinho' });
    expect(search.items.map((i) => i.key)).toEqual(['mv:238']);
    const genre = await tmdb.browse({ type: 'tv', page: 1, search: 'a', genre: 35 });
    expect(genre.items.every((i) => i.genres.includes('Comedy'))).toBe(true);
  });

  it('gives the details of a series and of a movie', async () => {
    const { tmdb } = await fake();
    const bb = await tmdb.details('tv', 1396);
    expect(bb).toMatchObject({
      seasons: 5,
      duration: 47,
      endYear: 2013,
      creators: ['Vince Gilligan'],
      trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      cast: ['Actor One', 'Actor Two'],
      coverLarge: 'https://image.tmdb.org/t/p/w780/poster1396.jpg',
    });
    expect(bb.meta).toMatchObject({ key: 'tv:1396', status: 'FINISHED', episodes: 62, studio: 'AMC' });
    expect(bb.recommendations).toHaveLength(3);
    expect(animeMetaSchema.safeParse(bb.meta).success).toBe(true);

    const squid = await tmdb.details('tv', 93405);
    expect(squid.meta.title).toBe('Squid Game');
    expect(squid.synopsis).toMatch(/cash-strapped/); // no Portuguese synopsis: English one

    const movie = await tmdb.details('movie', 157336);
    expect(movie).toMatchObject({ duration: 169, seasons: null, creators: [] });
    expect(movie.meta).toMatchObject({ key: 'mv:157336', studio: 'Christopher Nolan', status: 'FINISHED' });
    await expect(tmdb.details('movie', 999)).rejects.toThrow(new TmdbError('not_found'));
  });

  it('explains what is wrong with the key', async () => {
    const server = await startFakeTmdb();
    cleanups.push(server.close);
    await expect(new Tmdb({ baseUrl: server.url }).browse({ type: 'tv', page: 1 })).rejects.toThrow(new TmdbError('tmdb_not_configured'));
    await expect(new Tmdb({ key: 'wrong', baseUrl: server.url }).browse({ type: 'tv', page: 1 })).rejects.toThrow(new TmdbError('tmdb_key_invalid'));
    // The v4 token (a JWT) goes in the Authorization header, never in the URL.
    const bearer = new Tmdb({ key: FAKE_TMDB_TOKEN, baseUrl: server.url });
    expect((await bearer.browse({ type: 'movie', page: 1, sort: 'airing' })).items.map((i) => i.key)).toEqual(['mv:872585']);
    expect(server.hits.some((h) => h.includes('api_key') && h.includes('now_playing'))).toBe(false);
    await expect(new Tmdb({ key: FAKE_TMDB_KEY, baseUrl: 'http://127.0.0.1:1/3' }).browse({ type: 'tv', page: 1 })).rejects.toThrow(
      new TmdbError('tmdb_unreachable'),
    );
  });
});
