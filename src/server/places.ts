// Restaurants and places to visit: OpenStreetMap data, searched with Photon (https://photon.komoot.io),
// free and without a key. The browsers go through this server so the answers are cached. Places that
// are not on the map are added by hand in the app.
import type { CatalogPage, PlaceType } from '../shared/catalog';
import type { AnimeMeta } from '../shared/types';

const TTL = 60 * 60_000;
const MAX_CACHE = 500;
const USER_AGENT = 'LusiMovies (https://github.com/goncalosousa-hub/ClaudeRepo)';
// Results near Portugal first (not only: a place abroad can still be found).
const BIAS = { lat: '39.9', lon: '-8.5', zoom: '7' };

/** OpenStreetMap tags searched for each type (Photon "osm_tag" filters, combined with OR). */
const TAGS: Record<PlaceType, string[]> = {
  restaurant: [
    'amenity:restaurant',
    'amenity:cafe',
    'amenity:fast_food',
    'amenity:bar',
    'amenity:pub',
    'amenity:ice_cream',
    'amenity:food_court',
    'shop:bakery',
  ],
  place: [
    'tourism',
    'historic',
    'natural',
    'leisure:park',
    'leisure:garden',
    'leisure:nature_reserve',
    'leisure:water_park',
    'boundary:national_park',
    'boundary:protected_area',
    'place:city',
    'place:town',
    'place:village',
    'amenity:theatre',
    'amenity:arts_centre',
    'amenity:cinema',
  ],
};
/** Tourism things that are not places to visit. */
const SKIP = new Set(['information', 'hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'chalet', 'camp_pitch', 'caravan_site']);
const OSM_TYPES: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

export interface PlacesOptions {
  /** For tests: another server that speaks the Photon API */
  baseUrl?: string;
}

export type PlacesErrorCode = 'places_unreachable' | 'rate_limited' | 'places_error';

export class PlacesError extends Error {
  constructor(readonly code: PlacesErrorCode) {
    super(code);
    this.name = 'PlacesError';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** A Photon (OpenStreetMap) result in the app's format, or null when it has no name. */
export function fromPhoton(type: PlaceType, f: Json): AnimeMeta | null {
  const p = f?.properties ?? {};
  const osmType = OSM_TYPES[p.osm_type];
  const id = p.osm_id;
  const name = text(p.name, 120);
  if (!osmType || !Number.isSafeInteger(id) || id <= 0 || id > 1e12 || !name) return null;
  const value = typeof p.osm_value === 'string' ? p.osm_value : 'other';
  if (type === 'place' && p.osm_key === 'tourism' && SKIP.has(value)) return null;
  const [lon, lat] = Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates : [];
  const street = text(p.street, 150);
  const address = street ? `${street}${text(p.housenumber, 20) ? ` ${p.housenumber}` : ''}` : null;
  const city = text(p.city, 100) ?? text(p.town, 100) ?? text(p.village, 100) ?? text(p.locality, 100) ?? text(p.district, 100) ?? text(p.county, 100);
  return {
    key: `${type === 'restaurant' ? 'rs' : 'pl'}:${p.osm_type.toLowerCase()}${id}`,
    source: 'osm',
    sourceId: id,
    idMal: null,
    title: name,
    titleEnglish: null,
    titleNative: null,
    cover: '',
    color: null,
    banner: null,
    format: value.slice(0, 20),
    status: null,
    episodes: null,
    year: null,
    season: null,
    genres: [],
    score: null,
    studio: null,
    synopsis: '',
    url: `https://www.openstreetmap.org/${osmType}/${id}`,
    place: {
      address,
      // A town is its own city.
      city: city && city !== name ? city : (text(p.state, 100) ?? city),
      lat: typeof lat === 'number' && Math.abs(lat) <= 90 ? lat : null,
      lon: typeof lon === 'number' && Math.abs(lon) <= 180 ? lon : null,
    },
  };
}

export class Places {
  private cache = new Map<string, { expires: number; value: Promise<CatalogPage> }>();
  private readonly baseUrl: string;

  constructor(opts: PlacesOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://photon.komoot.io').replace(/\/+$/, '');
  }

  search(type: PlaceType, q: string): Promise<CatalogPage> {
    const qs = new URLSearchParams({ q, limit: '25', ...BIAS });
    for (const tag of TAGS[type]) qs.append('osm_tag', tag);
    const url = `${this.baseUrl}/api/?${qs}`;
    const hit = this.cache.get(url);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = (async (): Promise<CatalogPage> => {
      let res: Response;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      } catch {
        throw new PlacesError('places_unreachable');
      }
      if (res.status === 429) throw new PlacesError('rate_limited');
      if (!res.ok) throw new PlacesError('places_error');
      let data: Json;
      try {
        data = await res.json();
      } catch {
        throw new PlacesError('places_error');
      }
      const seen = new Set<string>();
      const items = ((Array.isArray(data?.features) ? data.features : []) as Json[])
        .map((f) => fromPhoton(type, f))
        .filter((m): m is AnimeMeta => m !== null && !seen.has(m.key) && !!seen.add(m.key));
      return { items, hasNext: false, total: items.length };
    })();
    const entry = { expires: Date.now() + TTL, value };
    this.cache.set(url, entry);
    value.catch(() => {
      if (this.cache.get(url) === entry) this.cache.delete(url);
    });
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }
}
