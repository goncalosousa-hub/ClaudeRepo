import type { MediaType, Recommend, WatchStatus } from '../../shared/types';

const rtf = new Intl.RelativeTimeFormat('pt-PT', { numeric: 'auto' });

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'agora mesmo';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 30 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  if (abs < 365 * 86_400) return rtf.format(Math.round(s / (30 * 86_400)), 'month');
  return rtf.format(Math.round(s / (365 * 86_400)), 'year');
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(n: number): string {
  return n.toLocaleString('pt-PT');
}

export function formatRating(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/**
 * Ratings are kept from 1 to 10 and shown as 1 to 5 stars (a star is 2 points), so the notes given
 * before the stars still count: 7/10 is 3,5 stars.
 */
export const toStars = (rating: number) => rating / 2;

/** "4,5": an average (1-10) in stars, with one decimal. */
export const formatStars = (rating: number | null | undefined) => (rating == null ? '—' : formatRating(Math.round(toStars(rating) * 10) / 10));

export function plural(n: number, one: string, many: string) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Dark or light text, whichever reads better on the given background colour. */
export function readableOn(hex: string): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 0.179 is where contrast against black and against white is the same (WCAG).
  return luminance > 0.179 ? '#0b0b14' : '#ffffff';
}

/** Colour for a 1..10 rating (red → amber → green). */
export function ratingColor(n: number | null | undefined): string {
  if (n == null) return '#6e6e89';
  if (n >= 9) return '#22c55e';
  if (n >= 7) return '#84cc16';
  if (n >= 5) return '#f59e0b';
  if (n >= 3) return '#f97316';
  return '#ef4444';
}

export const RECOMMEND: Record<Recommend, { label: string; short: string; emoji: string; color: string }> = {
  yes: { label: 'Recomendo', short: 'Recomenda', emoji: '👍', color: '#22c55e' },
  maybe: { label: 'Talvez', short: 'Talvez', emoji: '🤔', color: '#f59e0b' },
  no: { label: 'Não recomendo', short: 'Não recomenda', emoji: '👎', color: '#ef4444' },
};

export const WATCH_STATUS: Record<WatchStatus, { label: string; emoji: string }> = {
  watched: { label: 'Já vi', emoji: '✅' },
  watching: { label: 'A ver', emoji: '▶️' },
  plan: { label: 'Quero ver', emoji: '📌' },
  dropped: { label: 'Desisti', emoji: '🛑' },
};

type StatusWords = Partial<Record<WatchStatus, { label: string; emoji: string }>>;
const BOOK_STATUS: StatusWords = {
  watched: { label: 'Já li', emoji: '✅' },
  watching: { label: 'A ler', emoji: '📖' },
  plan: { label: 'Quero ler', emoji: '📌' },
  dropped: { label: 'Desisti', emoji: '🛑' },
};
const RESTAURANT_STATUS: StatusWords = {
  watched: { label: 'Já fui', emoji: '✅' },
  plan: { label: 'Quero ir', emoji: '📌' },
  dropped: { label: 'Não volto', emoji: '🛑' },
};
const PLACE_STATUS: StatusWords = {
  watched: { label: 'Já fui', emoji: '✅' },
  plan: { label: 'Quero ir', emoji: '📌' },
};
const statusWords = (media: MediaType): StatusWords =>
  media === 'book' ? BOOK_STATUS : media === 'restaurant' ? RESTAURANT_STATUS : media === 'place' ? PLACE_STATUS : WATCH_STATUS;

/** The states someone can pick for a title: "Já vi", "Já li", "Já fui"… depending on what it is. */
export const statusOptions = (media: MediaType) =>
  Object.entries(statusWords(media)).map(([id, w]) => ({ id: id as WatchStatus, ...w }));

/** Label and emoji of a state, in the words of the title's kind. */
export const statusInfo = (media: MediaType, status: WatchStatus) => statusWords(media)[status] ?? WATCH_STATUS[status];

const ERRORS: Record<string, string> = {
  room_not_found: 'Esta sala não existe (ou o link está incompleto).',
  auth_failed: 'Este perfil está protegido por outra chave. Cria um perfil novo neste dispositivo.',
  forbidden: 'Só podes mexer na tierlist do grupo ou na tua.',
  not_owner: 'Só o dono da sala pode fazer isto.',
  community_locked: 'Esta app é só para colaboradores: volta à página inicial e escreve o código da comunidade.',
  not_member: 'Essa pessoa não é membro da sala.',
  rate_limited: 'Calma! Estás a fazer alterações depressa demais.',
  limit_anime: 'A sala chegou ao limite de títulos.',
  kind_conflict: 'A sala já tem títulos que esse tipo não aceita (por exemplo, animes numa sala só de filmes).',
  already_in_room: 'Já existe um sítio com esse nome nessa localidade.',
  limit_photos_title: 'Já puseste o máximo de fotos neste título.',
  limit_photos: 'Esta sala chegou ao limite de fotos.',
  photos_full: 'O espaço para fotos do servidor está cheio. Fala com quem gere a app.',
  invalid_image: 'Esse ficheiro não é uma imagem que dê para usar.',
  media_not_allowed: 'Esta sala não aceita esse tipo de título (vê se é uma sala de filmes, séries ou anime).',
  limit_members: 'A sala está cheia.',
  anime_not_found: 'Esse título já não está na sala.',
  tier_not_found: 'Esse tier já não existe.',
  board_not_found: 'Essa tierlist já não existe.',
  invalid_op: 'Pedido inválido.',
  invalid_tiers: 'Tiers inválidos (nomes vazios ou repetidos?).',
  invalid_name: 'Nome inválido.',
  empty_message: 'Mensagem vazia.',
  not_joined: 'Ainda não estás ligado à sala.',
  timeout: 'O servidor não respondeu. Verifica a ligação.',
  server_error: 'Erro no servidor. Tenta outra vez.',
};

export function errorMessage(code: string): string {
  return ERRORS[code] ?? `Erro: ${code}`;
}
