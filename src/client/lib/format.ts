import type { Recommend, WatchStatus } from '../../shared/types';

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

const ERRORS: Record<string, string> = {
  room_not_found: 'Esta sala não existe (ou o link está incompleto).',
  auth_failed: 'Este perfil está protegido por outra chave. Cria um perfil novo neste dispositivo.',
  forbidden: 'Só podes mexer na tierlist do grupo ou na tua.',
  rate_limited: 'Calma! Estás a fazer alterações depressa demais.',
  limit_anime: 'A sala chegou ao limite de títulos.',
  media_not_allowed: 'Esta sala não aceita esse tipo de título (vê se é uma sala de anime, séries ou filmes).',
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
