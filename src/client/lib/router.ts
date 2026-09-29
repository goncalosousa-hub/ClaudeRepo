import { useEffect, useState } from 'react';
import { COMMUNITY_SECTIONS, communitySection } from '../../shared/constants';

// A tiny history-based router: "/" and "/livros", "/restaurantes", "/sitios" (the community spaces),
// "/salas" (rooms) and "/r/:roomId".
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

/** Path of a room; the community spaces live at "/", "/livros"… */
export const roomPath = (id: string) => communitySection(id)?.path ?? `/r/${id}`;

/** The community space shown at a path ("/" and anything unknown: the first one). */
export const sectionAt = (path: string) =>
  COMMUNITY_SECTIONS.find((s) => s.path !== '/' && (path === s.path || path === `${s.path}/`)) ?? COMMUNITY_SECTIONS[0];

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
