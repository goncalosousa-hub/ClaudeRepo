import { useEffect, useState } from 'react';

// A tiny history-based router: the app only has "/" and "/r/:roomId".
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

export function roomUrl(id: string) {
  return `${location.origin}/r/${id}`;
}

/** Accepts a room code or a full link and returns the room id. */
export function parseRoomInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  const fromLink = text.match(/\/r\/([a-z0-9]{6,16})/);
  if (fromLink) return fromLink[1];
  return /^[a-z0-9]{6,16}$/.test(text) ? text : null;
}
