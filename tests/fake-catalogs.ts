// Small fakes of Open Library (books) and Photon (OpenStreetMap search), served by the fake TMDB
// server under /ol and /photon, for the server tests and the E2E tests.

interface Book {
  id: number;
  title: string;
  authors: string[];
  year: number;
  cover: number | null;
  pages: number;
  subjects: string[];
  rating: number;
  ratings: number;
  por: boolean;
  description: string;
}

const BOOKS: Book[] = [
  { id: 1001, title: 'Os Maias', authors: ['Eça de Queirós'], year: 1888, cover: 501, pages: 716, subjects: ['Fiction', 'Portuguese literature', 'Classics'], rating: 4.1, ratings: 320, por: true, description: 'A história de três gerações da família Maia.\n----------\nSee also: [Wikipedia](https://example.org)' },
  { id: 1002, title: 'Ensaio sobre a Cegueira', authors: ['José Saramago'], year: 1995, cover: 502, pages: 310, subjects: ['Fiction', 'Dystopias'], rating: 4.3, ratings: 900, por: true, description: 'Uma epidemia de cegueira branca.' },
  { id: 1003, title: 'O Senhor dos Anéis', authors: ['J. R. R. Tolkien'], year: 1954, cover: 503, pages: 1200, subjects: ['Fantasy fiction', 'Adventure'], rating: 4.6, ratings: 5000, por: false, description: '' },
  { id: 1004, title: 'Duna', authors: ['Frank Herbert'], year: 1965, cover: 504, pages: 600, subjects: ['Science fiction'], rating: 4.4, ratings: 3000, por: false, description: 'Areia, especiarias e vermes gigantes.' },
  { id: 1005, title: 'Livro sem capa', authors: ['Anónimo'], year: 2001, cover: null, pages: 90, subjects: ['Poetry'], rating: 3, ratings: 2, por: true, description: '' },
];

function doc(b: Book) {
  return {
    key: `/works/OL${b.id}W`,
    title: b.title,
    author_name: b.authors,
    first_publish_year: b.year,
    cover_i: b.cover ?? undefined,
    number_of_pages_median: b.pages,
    subject: b.subjects,
    ratings_average: b.rating,
    ratings_count: b.ratings,
  };
}

export function handleOpenLibrary(url: URL): { status: number; body: unknown } {
  const path = url.pathname.replace(/^\/ol/, '');
  if (path === '/trending/weekly.json') return { status: 200, body: { works: BOOKS.map(doc) } };
  if (path === '/search.json') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const key = /key:\/works\/OL(\d+)W/.exec(q);
    let found = BOOKS;
    if (key) found = BOOKS.filter((b) => b.id === Number(key[1]));
    else {
      const words = q
        .replace(/[a-z_]+:(\[[^\]]*\]|"[^"]*"|\S+)/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      const subject = /subject:"([^"]+)"/.exec(q)?.[1];
      found = BOOKS.filter(
        (b) =>
          words.every((w) => `${b.title} ${b.authors.join(' ')}`.toLowerCase().includes(w)) &&
          (!subject || b.subjects.some((s) => s.toLowerCase().includes(subject))) &&
          (!q.includes('language:por') || b.por),
      );
      if (url.searchParams.get('sort') === 'rating') found = [...found].sort((a, b) => b.rating - a.rating);
    }
    return { status: 200, body: { numFound: found.length, start: 0, docs: found.map(doc) } };
  }
  const work = /^\/works\/OL(\d+)W\.json$/.exec(path);
  if (work) {
    const b = BOOKS.find((x) => x.id === Number(work[1]));
    if (!b) return { status: 404, body: { error: 'notfound' } };
    return {
      status: 200,
      body: {
        key: `/works/OL${b.id}W`,
        title: b.title,
        description: b.id === 1002 ? { type: '/type/text', value: b.description } : b.description || undefined,
        covers: b.cover ? [b.cover] : [],
        subjects: b.subjects,
      },
    };
  }
  return { status: 404, body: { error: 'unknown path' } };
}

interface Spot {
  type: 'N' | 'W' | 'R';
  id: number;
  name: string;
  key: string;
  value: string;
  street?: string;
  housenumber?: string;
  city?: string;
  lat: number;
  lon: number;
}

const SPOTS: Spot[] = [
  { type: 'N', id: 1234567890, name: 'Tasca do Zé', key: 'amenity', value: 'restaurant', street: 'Rua Direita', housenumber: '12', city: 'Leiria', lat: 39.743, lon: -8.807 },
  { type: 'N', id: 222, name: 'Café Central', key: 'amenity', value: 'cafe', street: 'Praça Rodrigues Lobo', city: 'Leiria', lat: 39.744, lon: -8.808 },
  { type: 'W', id: 333, name: 'Marisqueira da Praia', key: 'amenity', value: 'restaurant', city: 'Figueira da Foz', lat: 40.15, lon: -8.86 },
  { type: 'W', id: 444, name: 'Praia da Tocha', key: 'natural', value: 'beach', city: 'Cantanhede', lat: 40.33, lon: -8.84 },
  { type: 'R', id: 555, name: 'Castelo de Leiria', key: 'historic', value: 'castle', city: 'Leiria', lat: 39.747, lon: -8.809 },
  { type: 'N', id: 666, name: 'Posto de Turismo de Leiria', key: 'tourism', value: 'information', city: 'Leiria', lat: 39.74, lon: -8.8 },
  { type: 'N', id: 777, name: '', key: 'amenity', value: 'restaurant', city: 'Leiria', lat: 39.7, lon: -8.8 },
];

export function handlePhoton(url: URL): { status: number; body: unknown } {
  if (url.pathname.replace(/^\/photon/, '') !== '/api/') return { status: 404, body: { message: 'unknown path' } };
  const q = (url.searchParams.get('q') ?? '').toLowerCase();
  const tags = url.searchParams.getAll('osm_tag');
  const matchesTag = (s: Spot) => tags.length === 0 || tags.some((t) => t === s.key || t === `${s.key}:${s.value}`);
  const words = q.split(/\s+/).filter(Boolean);
  const found = SPOTS.filter((s) => matchesTag(s) && words.every((w) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(w)));
  return {
    status: 200,
    body: {
      type: 'FeatureCollection',
      features: found.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          osm_type: s.type,
          osm_id: s.id,
          osm_key: s.key,
          osm_value: s.value,
          name: s.name || undefined,
          street: s.street,
          housenumber: s.housenumber,
          city: s.city,
          country: 'Portugal',
          countrycode: 'PT',
        },
      })),
    },
  };
}
