import type { RoomKind, Tier } from './types';

export const LIMITS = {
  roomName: 60,
  memberName: 24,
  memberUnit: 40,
  tierLabel: 24,
  maxTiers: 15,
  maxAnime: 1500,
  maxMembers: 100,
  /** The community space holds everyone */
  maxGlobalAnime: 5000,
  maxGlobalMembers: 10_000,
  opinion: 2000,
  chatText: 500,
  chatHistory: 300,
  activityHistory: 200,
  synopsis: 1500,
  /** Photos one person adds to one title */
  photosPerMember: 6,
  maxPhotos: 300,
  maxGlobalPhotos: 3000,
  /** Largest photo accepted (they are resized in the browser first) */
  photoBytes: 1_200_000,
  photoThumbBytes: 150_000,
} as const;

export const ROOM_ID_RE = /^[a-z0-9]{6,16}$/;

/** The community space: the room everyone is in, opened at "/". Random room ids have 8 characters. */
export const GLOBAL_ROOM_ID = 'comunidade';

/**
 * The community has one space per category, each a room everyone is in (with its own tier list,
 * ranking and chat). The first one is the original community room, opened at "/".
 */
export const COMMUNITY_SECTIONS: { id: string; kind: RoomKind; path: string; label: string; emoji: string }[] = [
  { id: GLOBAL_ROOM_ID, kind: 'all', path: '/', label: 'Filmes e séries', emoji: '🍿' },
  { id: 'livros', kind: 'books', path: '/livros', label: 'Livros', emoji: '📚' },
  { id: 'restaurantes', kind: 'restaurants', path: '/restaurantes', label: 'Restaurantes', emoji: '🍽️' },
  { id: 'sitios', kind: 'places', path: '/sitios', label: 'Sítios', emoji: '📍' },
];

export const communitySection = (roomId: string) => COMMUNITY_SECTIONS.find((s) => s.id === roomId) ?? null;

/** Photo ids (nanoid). */
export const PHOTO_ID_RE = /^[A-Za-z0-9_-]{21}$/;

/** Account usernames: 3-24 chars, lowercase letters/digits and _ . - (safe as a file name on every OS). */
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])$/;
const RESERVED_USERNAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
export const isValidUsername = (username: string) => USERNAME_RE.test(username) && !RESERVED_USERNAMES.test(username);
export const PASSWORD_MIN = 6;

export const DEFAULT_TIERS: Tier[] = [
  { id: 's', label: 'S', color: '#ff5d73' },
  { id: 'a', label: 'A', color: '#ff9f43' },
  { id: 'b', label: 'B', color: '#ffd23f' },
  { id: 'c', label: 'C', color: '#8fd14f' },
  { id: 'd', label: 'D', color: '#3fc1f0' },
  { id: 'f', label: 'F', color: '#a78bfa' },
];

export const TIER_PRESETS: { name: string; tiers: Tier[] }[] = [
  { name: 'Clássico (S → F)', tiers: DEFAULT_TIERS },
  {
    name: 'Emojis',
    tiers: [
      { id: 'goat', label: '🐐 GOAT', color: '#ff5d73' },
      { id: 'top', label: '🔥 Top', color: '#ff9f43' },
      { id: 'bom', label: '😎 Bom', color: '#ffd23f' },
      { id: 'meh', label: '😐 Meh', color: '#8fd14f' },
      { id: 'lixo', label: '💀 Lixo', color: '#6b7280' },
    ],
  },
  {
    name: 'Veredito',
    tiers: [
      { id: 'obra', label: 'Obra-prima', color: '#f472b6' },
      { id: 'mbom', label: 'Muito bom', color: '#a78bfa' },
      { id: 'bom', label: 'Bom', color: '#60a5fa' },
      { id: 'ok', label: 'Aceitável', color: '#34d399' },
      { id: 'fraco', label: 'Fraco', color: '#fbbf24' },
      { id: 'drop', label: 'Desisti', color: '#6b7280' },
    ],
  },
];

export const TIER_COLORS = [
  '#ff5d73', '#ff9f43', '#ffd23f', '#8fd14f', '#3fc1f0', '#a78bfa',
  '#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#6b7280',
];

export const MEMBER_COLORS = [
  '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#a855f7', '#d946ef', '#ec4899', '#84cc16',
];

export const AVATARS = [
  '🦊', '🐱', '🐼', '🐸', '🐙', '🦄', '🐲', '👾', '🍥', '🍙',
  '🌸', '⚡', '🔥', '💀', '🥷', '🤖', '👻', '🐧', '🦉', '🍜',
];

/** Only images from these hosts are accepted in title metadata and by the image proxy. */
export function isAllowedImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const h = url.hostname;
  return (
    h === 'anilist.co' ||
    h.endsWith('.anilist.co') ||
    h === 'img.anili.st' ||
    h === 'myanimelist.net' ||
    h.endsWith('.myanimelist.net') ||
    h === 'image.tmdb.org' ||
    h === 'covers.openlibrary.org'
  );
}

export function isAllowedSiteUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const h = url.hostname;
  return (
    h === 'anilist.co' ||
    h.endsWith('.anilist.co') ||
    h === 'myanimelist.net' ||
    h.endsWith('.myanimelist.net') ||
    h === 'www.themoviedb.org' ||
    h === 'openlibrary.org' ||
    h === 'www.openstreetmap.org'
  );
}
