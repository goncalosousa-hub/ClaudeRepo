import { useEffect, useState } from 'react';
import { GLOBAL_ROOM_ID } from '../../shared/constants';

// A tiny history-based router: "/" (the community space), "/salas" (rooms) and "/r/:roomId".
const EVENT = 'atl:navigate';

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const sync = () => setPath(location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return path;
}

export const ROOMS_PATH = '/salas';

/** Path of a room; the community space lives at "/". */
export const roomPath = (id: string) => (id === GLOBAL_ROOM_ID ? '/' : `/r/${id}`);

export function roomUrl(id: string) {
  return `${location.origin}${roomPath(id)}`;
}

/** Accepts a room code or a full link and returns the room id. */
export function parseRoomInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  const fromLink = text.match(/\/r\/([a-z0-9]{6,16})/);
  if (fromLink) return fromLink[1];
  return /^[a-z0-9]{6,16}$/.test(text) ? text : null;
}
