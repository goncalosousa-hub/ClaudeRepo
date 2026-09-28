import { useCallback, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { AVATARS, MEMBER_COLORS } from '../../shared/constants';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * The profile used in rooms. The secret proves to the server that this browser owns the id; with an
 * account (username + password) the same profile can be recovered on any link or device.
 */
export interface LocalUser {
  id: string;
  secret: string;
  name: string;
  color: string;
  avatar: string;
  /** Company or unit of the group where the person works (optional) */
  unit?: string;
  /** Username of the account this profile belongs to (none for a profile without account). */
  account?: string;
}

const KEY = 'atl:user';
const EVENT = 'atl:user-changed';

function isValid(u: unknown): u is LocalUser {
  const x = u as LocalUser | null;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.secret === 'string' &&
    typeof x.name === 'string' &&
    !!x.name &&
    (x.unit === undefined || typeof x.unit === 'string') &&
    (x.account === undefined || typeof x.account === 'string')
  );
}

export function loadUser(): LocalUser | null {
  const u = readJSON<unknown>(KEY, null);
  return isValid(u) ? u : null;
}

export function saveUser(u: LocalUser) {
  writeJSON(KEY, u);
  window.dispatchEvent(new Event(EVENT));
}

/** Signs out: the profile stays safe in the account and comes back when signing in again. */
export function clearUser() {
  removeKey(KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function newUser(name: string, color: string, avatar: string): LocalUser {
  return { id: `u_${nanoid(14)}`, secret: nanoid(32), name, color, avatar };
}

export function randomColor() {
  return MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)];
}

export function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

function toBase64Url(text: string) {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string) {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Profile transfer link (to use the same profile on another device). */
export function profileLink(u: LocalUser) {
  return `${location.origin}/#perfil=${toBase64Url(JSON.stringify(u))}`;
}

export function importProfileFromHash(): LocalUser | null {
  const m = location.hash.match(/^#perfil=(.+)$/);
  if (!m) return null;
  try {
    const u = JSON.parse(fromBase64Url(m[1]));
    if (!isValid(u)) return null;
    history.replaceState(null, '', location.pathname + location.search);
    return u;
  } catch {
    return null;
  }
}

export function useUser(): [LocalUser | null, (u: LocalUser) => void] {
  const [user, setUser] = useState<LocalUser | null>(() => loadUser());
  useEffect(() => {
    const sync = () => setUser(loadUser());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const update = useCallback((u: LocalUser) => saveUser(u), []);
  return [user, update];
}
