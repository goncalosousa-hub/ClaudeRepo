// A small fake of the AniList GraphQL API (and its image CDN) so the E2E tests run offline.
import type { Page, Route } from '@playwright/test';

const TITLES: [number, string, string | null, string, number, string[]][] = [
  [154587, 'Sousou no Frieren', "Frieren: Beyond Journey's End", '#5a8f64', 2023, ['Adventure', 'Drama', 'Fantasy']],
  [21, 'ONE PIECE', 'ONE PIECE', '#e4a15d', 1999, ['Action', 'Adventure', 'Comedy']],
  [16498, 'Shingeki no Kyojin', 'Attack on Titan', '#a15d43', 2013, ['Action', 'Drama', 'Mystery']],
  [5114, 'Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST', 'Fullmetal Alchemist: Brotherhood', '#e4861a', 2009, ['Action', 'Adventure', 'Drama']],
  [1535, 'DEATH NOTE', 'Death Note', '#1a1a1a', 2006, ['Mystery', 'Psychological', 'Thriller']],
  [9253, 'Steins;Gate', 'Steins;Gate', '#5d86e4', 2011, ['Drama', 'Sci-Fi', 'Thriller']],
  [101922, 'Kimetsu no Yaiba', 'Demon Slayer', '#43a1a1', 2019, ['Action', 'Fantasy', 'Supernatural']],
  [113415, 'Jujutsu Kaisen', 'JUJUTSU KAISEN', '#5d43e4', 2020, ['Action', 'Drama', 'Supernatural']],
  [140960, 'SPY×FAMILY', 'SPY x FAMILY', '#e45d86', 2022, ['Action', 'Comedy', 'Slice of Life']],
  [127230, 'Chainsaw Man', 'Chainsaw Man', '#e4c843', 2022, ['Action', 'Drama', 'Horror']],
  [11061, 'HUNTER×HUNTER (2011)', 'Hunter x Hunter (2011)', '#50a143', 2011, ['Action', 'Adventure', 'Fantasy']],
  [21519, 'Kimi no Na wa.', 'Your Name.', '#43a1e4', 2016, ['Drama', 'Romance', 'Supernatural']],
  [199, 'Sen to Chihiro no Kamikakushi', 'Spirited Away', '#86e4a1', 2001, ['Adventure', 'Drama', 'Fantasy']],
  [21507, 'Mob Psycho 100', 'Mob Psycho 100', '#e45d5d', 2016, ['Action', 'Comedy', 'Supernatural']],
  [101348, 'Vinland Saga', 'Vinland Saga', '#a1865d', 2019, ['Action', 'Adventure', 'Drama']],
  [21827, 'Violet Evergarden', 'Violet Evergarden', '#bbe4f1', 2018, ['Drama', 'Fantasy', 'Slice of Life']],
  [97986, 'Made in Abyss', 'Made in Abyss', '#e4bb5d', 2017, ['Adventure', 'Drama', 'Fantasy']],
  [1575, 'Code Geass: Hangyaku no Lelouch', 'Code Geass: Lelouch of the Rebellion', '#861a43', 2006, ['Action', 'Drama', 'Mecha']],
  [30, 'Shin Seiki Evangelion', 'Neon Genesis Evangelion', '#5d1ae4', 1995, ['Action', 'Drama', 'Mecha']],
  [130003, 'Bocchi the Rock!', 'BOCCHI THE ROCK!', '#f1a1c9', 2022, ['Comedy', 'Music', 'Slice of Life']],
  [150672, '[Oshi no Ko]', '[Oshi No Ko]', '#e4435d', 2023, ['Drama', 'Mystery', 'Psychological']],
  [1, 'Cowboy Bebop', 'Cowboy Bebop', '#f1785d', 1998, ['Action', 'Adventure', 'Drama']],
  [457, 'Mushishi', 'Mushi-Shi', '#86a143', 2005, ['Adventure', 'Mystery', 'Slice of Life']],
  [19, 'MONSTER', 'Monster', '#1a0d0d', 2004, ['Drama', 'Mystery', 'Psychological']],
  [20954, 'Koe no Katachi', 'A Silent Voice', '#78bbe4', 2016, ['Drama', 'Romance', 'Slice of Life']],
  [161645, 'Kusuriya no Hitorigoto', 'The Apothecary Diaries', '#c95d78', 2023, ['Drama', 'Mystery']],
  [171018, 'Dandadan', 'DAN DA DAN', '#e4e443', 2024, ['Action', 'Comedy', 'Sci-Fi']],
  [151807, 'Ore dake Level Up na Ken', 'Solo Leveling', '#435de4', 2024, ['Action', 'Adventure', 'Fantasy']],
  [20464, 'Haikyuu!!', 'Haikyu!!', '#f1861a', 2014, ['Comedy', 'Drama', 'Sports']],
  [120377, 'Cyberpunk: Edgerunners', 'Cyberpunk: Edgerunners', '#e4f143', 2022, ['Action', 'Drama', 'Sci-Fi']],
];

const byId = new Map(TITLES.map((t) => [t[0], t]));

function media(t: (typeof TITLES)[number]) {
  const [id, romaji, english, color, year, genres] = t;
  return {
    id,
    idMal: id + 100000,
    isAdult: false,
    title: { romaji, english, native: null },
    coverImage: {
      large: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx${id}.jpg`,
      extraLarge: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx${id}.jpg`,
      color,
    },
    bannerImage: `https://s4.anilist.co/file/anilistcdn/media/anime/banner/${id}.jpg`,
    format: id === 21519 || id === 199 || id === 20954 ? 'MOVIE' : 'TV',
    status: 'FINISHED',
    episodes: 24,
    season: 'FALL',
    seasonYear: year,
    startDate: { year },
    genres,
    averageScore: 70 + (id % 25),
    studios: { nodes: [{ name: 'Studio Mock' }] },
    siteUrl: `https://anilist.co/anime/${id}`,
    description: `${english ?? romaji} é um anime de ${year}. <br><br>Sinopse de teste com <i>HTML</i> &amp; entidades.`,
  };
}

function svgCover(id: number, banner: boolean) {
  const t = byId.get(id);
  const color = t?.[3] ?? '#6366f1';
  const label = (t?.[2] ?? t?.[1] ?? `#${id}`).replace(/[<&>]/g, '');
  const [w, h] = banner ? [1200, 300] : [230, 326];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${h * 0.22}" fill="#ffffff" opacity="0.12"/>
  <text x="12" y="${banner ? h / 2 : 40}" font-family="sans-serif" font-size="${banner ? 48 : 22}" font-weight="700" fill="#fff" opacity="0.9">${label.slice(0, 18)}</text>
</svg>`;
}

export async function mockAniList(page: Page, opts: { calls?: string[] } = {}) {
  await page.route('https://s4.anilist.co/**', (route: Route) => {
    const url = route.request().url();
    const id = Number(url.match(/(?:bx|banner\/)(\d+)/)?.[1] ?? 0);
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgCover(id, url.includes('/banner/')) });
  });

  await page.route('https://graphql.anilist.co/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = route.request().postDataJSON() as { query: string; variables: Record<string, unknown> };
    opts.calls?.push(JSON.stringify(body.variables));
    if (body.query.includes('Media(id: $id')) {
      const t = byId.get(Number(body.variables.id));
      if (!t) return route.fulfill({ status: 404, headers: cors, json: { data: { Media: null }, errors: [{ message: 'Not Found.', status: 404 }] } });
      return route.fulfill({
        headers: cors,
        json: {
          data: {
            Media: {
              ...media(t),
              duration: 24,
              source: 'MANGA',
              endDate: { year: t[4] + 1 },
              trailer: { id: 'dQw4w9WgXcQ', site: 'youtube' },
              tags: [{ name: 'Tag de teste', rank: 90, isMediaSpoiler: false }],
              nextAiringEpisode: null,
              recommendations: { nodes: TITLES.filter((x) => x[0] !== t[0]).slice(0, 5).map((x) => ({ mediaRecommendation: media(x) })) },
            },
          },
        },
      });
    }
    const v = body.variables;
    const search = typeof v.search === 'string' ? v.search.toLowerCase() : '';
    let list = TITLES.filter((t) => !search || `${t[1]} ${t[2] ?? ''}`.toLowerCase().includes(search));
    if (typeof v.genre === 'string') list = list.filter((t) => t[5].includes(v.genre as string));
    const perPage = Number(v.perPage ?? 30);
    const page = Number(v.page ?? 1);
    const slice = list.slice((page - 1) * perPage, page * perPage);
    return route.fulfill({
      headers: cors,
      json: {
        data: {
          Page: { pageInfo: { total: list.length, hasNextPage: page * perPage < list.length }, media: slice.map(media) },
        },
      },
    });
  });
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
