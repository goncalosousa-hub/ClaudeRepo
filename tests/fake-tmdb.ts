// A small fake of the TMDB API, used by the server tests and (as its own process) by the E2E tests.
// It also answers as Open Library (/ol) and Photon (/photon): see fake-catalogs.ts; and serves the
// keys and tokens of a fake Google sign-in (/google): see fake-google.ts.
//   npx tsx tests/fake-tmdb.ts 4479   → http://127.0.0.1:4479/3, /ol, /photon and /google
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleOpenLibrary, handlePhoton } from './fake-catalogs';
import { handleGoogle } from './fake-google';

export const FAKE_TMDB_KEY = 'fake-tmdb-key';
/** Same access as the key, as a v4 "API Read Access Token" (sent as a Bearer header). */
export const FAKE_TMDB_TOKEN = 'eyJfake.read.token';

interface Entry {
  id: number;
  pt: string;
  en: string;
  original: string;
  date: string;
  genres: number[];
  vote: number;
  popularity: number;
  overviewPt: string;
  overviewEn: string;
}

const SERIES: Entry[] = [
  { id: 1396, pt: 'Breaking Bad', en: 'Breaking Bad', original: 'Breaking Bad', date: '2008-01-20', genres: [18, 80], vote: 8.9, popularity: 90, overviewPt: 'Um professor de química com cancro torna-se produtor de metanfetamina.', overviewEn: 'A chemistry teacher turns to making meth.' },
  { id: 66732, pt: 'Stranger Things', en: 'Stranger Things', original: 'Stranger Things', date: '2016-07-15', genres: [18, 10765, 9648], vote: 8.6, popularity: 95, overviewPt: 'Um rapaz desaparece e a vila descobre um mistério sobrenatural.', overviewEn: 'A boy vanishes.' },
  { id: 1399, pt: 'A Guerra dos Tronos', en: 'Game of Thrones', original: 'Game of Thrones', date: '2011-04-17', genres: [10765, 18, 10759], vote: 8.5, popularity: 88, overviewPt: 'Nove famílias nobres lutam pelo controlo de Westeros.', overviewEn: 'Nine noble families fight for control of Westeros.' },
  { id: 70523, pt: 'Dark', en: 'Dark', original: 'Dark', date: '2017-12-01', genres: [80, 18, 9648, 10765], vote: 8.4, popularity: 60, overviewPt: 'O desaparecimento de duas crianças revela segredos de quatro famílias.', overviewEn: 'A missing child sets four families on a frantic hunt.' },
  { id: 93405, pt: '오징어 게임', en: 'Squid Game', original: '오징어 게임', date: '2021-09-17', genres: [10759, 9648, 18], vote: 7.8, popularity: 80, overviewPt: '', overviewEn: 'Hundreds of cash-strapped players accept an invitation to compete in games.' },
  { id: 2316, pt: 'The Office', en: 'The Office', original: 'The Office', date: '2005-03-24', genres: [35], vote: 8.6, popularity: 70, overviewPt: 'O dia a dia de um escritório de uma empresa de papel.', overviewEn: 'The everyday lives of office employees.' },
  { id: 87108, pt: 'Chernobyl', en: 'Chernobyl', original: 'Chernobyl', date: '2019-05-06', genres: [18], vote: 8.7, popularity: 50, overviewPt: 'A história do desastre nuclear de 1986.', overviewEn: 'The true story of the 1986 nuclear disaster.' },
  { id: 94605, pt: 'Arcane', en: 'Arcane', original: 'Arcane', date: '2021-11-06', genres: [16, 10765, 10759, 18], vote: 8.8, popularity: 75, overviewPt: 'Duas irmãs em lados opostos de uma guerra.', overviewEn: 'Two sisters on opposite sides of a war.' },
];

const MOVIES: Entry[] = [
  { id: 238, pt: 'O Padrinho', en: 'The Godfather', original: 'The Godfather', date: '1972-03-14', genres: [18, 80], vote: 8.7, popularity: 85, overviewPt: 'O patriarca de uma família do crime organizado passa o controlo ao filho.', overviewEn: 'The aging patriarch of a crime dynasty transfers control to his son.' },
  { id: 157336, pt: 'Interstellar', en: 'Interstellar', original: 'Interstellar', date: '2014-11-05', genres: [12, 18, 878], vote: 8.4, popularity: 99, overviewPt: 'Um grupo de exploradores viaja através de um buraco de minhoca.', overviewEn: 'Explorers travel through a wormhole.' },
  { id: 27205, pt: 'A Origem', en: 'Inception', original: 'Inception', date: '2010-07-15', genres: [28, 878, 12], vote: 8.4, popularity: 92, overviewPt: 'Um ladrão que rouba segredos através dos sonhos.', overviewEn: 'A thief who steals secrets through dreams.' },
  { id: 496243, pt: 'Parasitas', en: 'Parasite', original: '기생충', date: '2019-05-30', genres: [35, 53, 18], vote: 8.5, popularity: 70, overviewPt: 'Uma família pobre infiltra-se na casa de uma família rica.', overviewEn: 'A poor family schemes to become employed by a wealthy family.' },
  { id: 155, pt: 'O Cavaleiro das Trevas', en: 'The Dark Knight', original: 'The Dark Knight', date: '2008-07-16', genres: [18, 28, 80, 53], vote: 8.5, popularity: 80, overviewPt: 'Batman enfrenta o Joker.', overviewEn: 'Batman faces the Joker.' },
  { id: 680, pt: 'Pulp Fiction', en: 'Pulp Fiction', original: 'Pulp Fiction', date: '1994-09-10', genres: [53, 80], vote: 8.5, popularity: 65, overviewPt: 'Histórias de crime em Los Angeles.', overviewEn: 'Crime stories in Los Angeles.' },
  { id: 872585, pt: 'Oppenheimer', en: 'Oppenheimer', original: 'Oppenheimer', date: '2023-07-19', genres: [18, 36], vote: 8.1, popularity: 90, overviewPt: 'A história do pai da bomba atómica.', overviewEn: 'The story of the father of the atomic bomb.' },
  { id: 12, pt: 'À Procura de Nemo', en: 'Finding Nemo', original: 'Finding Nemo', date: '2003-05-30', genres: [16, 10751], vote: 7.8, popularity: 55, overviewPt: 'Um peixe-palhaço atravessa o oceano à procura do filho.', overviewEn: 'A clownfish crosses the ocean to find his son.' },
];

const ON_THE_AIR = [66732, 70523];
const NOW_PLAYING = [872585];
const UPCOMING = [12];

function listItem(type: 'tv' | 'movie', e: Entry, lang: string) {
  const name = lang === 'en-US' ? e.en : e.pt;
  const overview = lang === 'en-US' ? e.overviewEn : e.overviewPt;
  const common = {
    id: e.id,
    poster_path: `/poster${e.id}.jpg`,
    backdrop_path: `/backdrop${e.id}.jpg`,
    genre_ids: e.genres,
    vote_average: e.vote,
    vote_count: 5000,
    popularity: e.popularity,
    overview,
  };
  return type === 'tv'
    ? { ...common, name, original_name: e.original, first_air_date: e.date }
    : { ...common, title: name, original_title: e.original, release_date: e.date };
}

function details(type: 'tv' | 'movie', e: Entry, lang: string, append: string) {
  const base = {
    ...listItem(type, e, lang),
    genres: e.genres.map((id) => ({ id, name: String(id) })),
    status: type === 'tv' ? (e.id === 1396 ? 'Ended' : 'Returning Series') : 'Released',
  };
  const extra: Record<string, unknown> =
    type === 'tv'
      ? {
          number_of_seasons: 5,
          number_of_episodes: 62,
          episode_run_time: [47],
          last_air_date: '2013-09-29',
          networks: [{ name: 'AMC' }],
          created_by: [{ name: 'Vince Gilligan' }],
        }
      : { runtime: 169 };
  if (append.includes('credits')) {
    extra.credits = {
      cast: [{ name: 'Actor One' }, { name: 'Actor Two' }],
      crew: type === 'movie' ? [{ job: 'Director', name: 'Christopher Nolan' }, { job: 'Writer', name: 'Someone' }] : [],
    };
  }
  if (append.includes('videos')) {
    extra.videos = { results: [{ site: 'YouTube', key: 'dQw4w9WgXcQ', type: 'Trailer', official: true, iso_639_1: 'en' }] };
  }
  if (append.includes('recommendations')) {
    const list = type === 'tv' ? SERIES : MOVIES;
    extra.recommendations = { results: list.filter((x) => x.id !== e.id).slice(0, 3).map((x) => listItem(type, x, lang)) };
  }
  return { ...base, ...extra };
}

function page(results: unknown[]) {
  return { page: 1, results, total_pages: 1, total_results: results.length };
}

export function handleTmdb(url: URL, auth: string | undefined): { status: number; body: unknown } {
  const key = url.searchParams.get('api_key');
  if (key !== FAKE_TMDB_KEY && auth !== `Bearer ${FAKE_TMDB_TOKEN}`) {
    return { status: 401, body: { status_message: 'Invalid API key' } };
  }
  const lang = url.searchParams.get('language') ?? 'en-US';
  const path = url.pathname.replace(/^\/3/, '');
  let m: RegExpMatchArray | null;
  const listOf = (t: string) => (t === 'tv' ? SERIES : MOVIES);
  const byPopularity = (a: Entry, b: Entry) => b.popularity - a.popularity;

  if ((m = path.match(/^\/trending\/(tv|movie)\/week$/))) {
    const t = m[1] as 'tv' | 'movie';
    return { status: 200, body: page([...listOf(t)].sort(byPopularity).map((e) => listItem(t, e, lang))) };
  }
  if (path === '/tv/on_the_air') return { status: 200, body: page(SERIES.filter((e) => ON_THE_AIR.includes(e.id)).map((e) => listItem('tv', e, lang))) };
  if (path === '/movie/now_playing') return { status: 200, body: page(MOVIES.filter((e) => NOW_PLAYING.includes(e.id)).map((e) => listItem('movie', e, lang))) };
  if (path === '/movie/upcoming') return { status: 200, body: page(MOVIES.filter((e) => UPCOMING.includes(e.id)).map((e) => listItem('movie', e, lang))) };
  if ((m = path.match(/^\/search\/(tv|movie)$/))) {
    const t = m[1] as 'tv' | 'movie';
    const q = (url.searchParams.get('query') ?? '').toLowerCase();
    const found = listOf(t).filter((e) => [e.pt, e.en, e.original].some((n) => n.toLowerCase().includes(q)));
    return { status: 200, body: page(found.map((e) => listItem(t, e, lang))) };
  }
  if ((m = path.match(/^\/discover\/(tv|movie)$/))) {
    const t = m[1] as 'tv' | 'movie';
    const genre = Number(url.searchParams.get('with_genres')) || null;
    const year = Number(url.searchParams.get(t === 'tv' ? 'first_air_date_year' : 'primary_release_year')) || null;
    let found = listOf(t).filter((e) => (!genre || e.genres.includes(genre)) && (!year || e.date.startsWith(String(year))));
    found = [...found].sort(url.searchParams.get('sort_by') === 'vote_average.desc' ? (a, b) => b.vote - a.vote : byPopularity);
    return { status: 200, body: page(found.map((e) => listItem(t, e, lang))) };
  }
  if ((m = path.match(/^\/(tv|movie)\/(\d+)$/))) {
    const t = m[1] as 'tv' | 'movie';
    const e = listOf(t).find((x) => x.id === Number(m![2]));
    if (!e) return { status: 404, body: { status_message: 'Not found' } };
    return { status: 200, body: details(t, e, lang, url.searchParams.get('append_to_response') ?? '') };
  }
  return { status: 404, body: { status_message: 'Unknown path' } };
}

export async function startFakeTmdb(
  port = 0,
): Promise<{
  url: string;
  openLibraryUrl: string;
  photonUrl: string;
  googleCertsUrl: string;
  hits: string[];
  close: () => Promise<void>;
}> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    hits.push(`${url.pathname}?${url.searchParams}`);
    const { status, body } = url.pathname.startsWith('/ol/')
      ? handleOpenLibrary(url)
      : url.pathname.startsWith('/photon/')
        ? handlePhoton(url)
        : url.pathname.startsWith('/google/')
          ? handleGoogle(url)
          : handleTmdb(url, req.headers.authorization);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${actual}/3`,
    openLibraryUrl: `http://127.0.0.1:${actual}/ol`,
    photonUrl: `http://127.0.0.1:${actual}/photon`,
    googleCertsUrl: `http://127.0.0.1:${actual}/google/certs`,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Started on its own (E2E tests): npx tsx tests/fake-tmdb.ts <port>
if (process.argv[1] && /fake-tmdb\.[tj]s$/.test(process.argv[1])) {
  const port = Number(process.argv[2] ?? 4479);
  void startFakeTmdb(port).then(({ url }) => console.log(`fake TMDB on ${url}`));
}
