import { useEffect, useState } from 'react';
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
