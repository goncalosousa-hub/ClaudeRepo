import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

export interface Prefs {
  /** Which title to show when both exist */
  titles: 'romaji' | 'english';
  cardSize: 'sm' | 'md' | 'lg';
}

const KEY = 'atl:prefs';
const EVENT = 'atl:prefs-changed';
function defaults(): Prefs {
  const small = typeof window !== 'undefined' && window.innerWidth < 640;
  return { titles: 'romaji', cardSize: small ? 'sm' : 'md' };
}

function load(): Prefs {
  return { ...defaults(), ...readJSON<Partial<Prefs>>(KEY, {}) };
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState(load);
  useEffect(() => {
    const sync = () => setPrefs(load());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    writeJSON(KEY, { ...load(), ...patch });
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [prefs, update];
}
