import { useEffect, useState } from 'react';
import { mediaOfKind } from '../../shared/media';
import type { MediaType, RoomKind } from '../../shared/types';
import { tmdbAvailable } from '../lib/tmdb-api';

/** Whether this server offers series and movies (null while asking). */
export function useTmdbAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void tmdbAvailable().then((v) => alive && setAvailable(v));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

/**
 * The catalogues a room browses, in order (films, series, anime), and the one on screen: the first,
 * or anime while this server has no TMDB key.
 */
export function useCatalogTabs(kind: RoomKind) {
  const tmdb = useTmdbAvailable();
  const catalogs = mediaOfKind(kind);
  const [chosen, setMedia] = useState<MediaType | null>(null);
  const fallback = tmdb === false && catalogs.includes('anime') ? 'anime' : catalogs[0];
  const media = chosen && catalogs.includes(chosen) ? chosen : fallback;
  const fromTmdb = media !== 'anime';
  return {
    catalogs,
    media,
    setMedia,
    /** Still asking the server whether it has series and movies. */
    waiting: fromTmdb && tmdb === null,
    /** Series and movies are off on this server (no TMDB key). */
    off: fromTmdb && tmdb === false,
  };
}
