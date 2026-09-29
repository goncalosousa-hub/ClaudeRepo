// Draws a tier list on a <canvas> and downloads it as a PNG (to share on WhatsApp, Discord…).
import { APP_NAME } from '../../shared/brand';
import type { AnimeMeta, Board, Photo, Tier } from '../../shared/types';
import { readableOn } from './format';

const FONT = "'Inter Variable', ui-sans-serif, system-ui, sans-serif";

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    // Same-origin copy served by our server, so the canvas can be exported (photos already are).
    img.src = url.startsWith('/api/') ? url : `/api/img?url=${encodeURIComponent(url)}`;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  color: string | null,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 7);
  ctx.clip();
  ctx.fillStyle = color ?? '#1f1f2f';
  ctx.fillRect(x, y, w, h);
  if (img) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  const grad = ctx.createLinearGradient(0, y + h * 0.45, 0, y + h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 11px ${FONT}`;
  const lines = wrapLines(ctx, title, w - 8, 2);
  lines.forEach((l, i) => ctx.fillText(l, x + 4, y + h - 6 - (lines.length - 1 - i) * 13));
  ctx.restore();
}

export async function exportTierlistImage(opts: {
  title: string;
  subtitle: string;
  tiers: Tier[];
  lists: Board;
  anime: Record<string, AnimeMeta>;
  titleOf: (a: AnimeMeta) => string;
  photos?: Record<string, Photo[]>;
}) {
  const { title, subtitle, tiers, lists, anime, titleOf } = opts;
  const W = 1200;
  const PAD = 28;
  const LABEL_W = 116;
  const GAP = 6;
  const CARD_W = 84;
  const CARD_H = 120;
  const HEADER_H = 96;
  const FOOTER_H = 40;
  const areaW = W - PAD * 2 - LABEL_W - GAP;
  const perRow = Math.max(1, Math.floor((areaW - GAP) / (CARD_W + GAP)));

  const rows = tiers.map((tier) => {
    const keys = (lists[tier.id] ?? []).filter((k) => anime[k]);
    const lines = Math.max(1, Math.ceil(keys.length / perRow));
    return { tier, keys, height: lines * (CARD_H + GAP) + GAP };
  });
  const H = HEADER_H + rows.reduce((acc, r) => acc + r.height + GAP, 0) + FOOTER_H;

  await document.fonts?.ready;
  const allKeys = rows.flatMap((r) => r.keys);
  // Restaurants and places have no cover: their first photo, if any.
  const coverOf = (k: string) => anime[k].cover || (opts.photos?.[k]?.[0] ? `/api/photos/${opts.photos[k][0].id}/thumb` : '');
  const images = new Map(await Promise.all(allKeys.map(async (k) => [k, await loadImage(coverOf(k))] as const)));

  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not supported');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createLinearGradient(0, 0, W, 0);
  glow.addColorStop(0, '#8b5cf6');
  glow.addColorStop(1, '#ec4899');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 5);

  ctx.fillStyle = '#ededf5';
  ctx.font = `800 32px ${FONT}`;
  ctx.fillText(title, PAD, 52);
  ctx.fillStyle = '#a3a3bb';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText(`${subtitle} · ${new Date().toLocaleDateString('pt-PT')}`, PAD, 78);

  let y = HEADER_H;
  for (const r of rows) {
    const h = r.height;
    roundRect(ctx, PAD, y, LABEL_W, h, 10);
    ctx.fillStyle = r.tier.color;
    ctx.fill();
    ctx.fillStyle = readableOn(r.tier.color);
    let size = r.tier.label.length <= 2 ? 40 : r.tier.label.length <= 5 ? 24 : 16;
    ctx.font = `900 ${size}px ${FONT}`;
    while (size > 10 && ctx.measureText(r.tier.label).width > LABEL_W - 14) {
      size -= 1;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.tier.label, PAD + LABEL_W / 2, y + h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    roundRect(ctx, PAD + LABEL_W + GAP, y, areaW, h, 10);
    ctx.fillStyle = '#161623';
    ctx.fill();

    r.keys.forEach((k, i) => {
      const col = i % perRow;
      const line = Math.floor(i / perRow);
      const x = PAD + LABEL_W + GAP * 2 + col * (CARD_W + GAP);
      const cy = y + GAP + line * (CARD_H + GAP);
      drawCard(ctx, images.get(k) ?? null, x, cy, CARD_W, CARD_H, titleOf(anime[k]), anime[k].color);
    });
    y += h + GAP;
  }

  ctx.fillStyle = '#6e6e89';
  ctx.font = `500 12px ${FONT}`;
  const fromTmdb = allKeys.some((k) => anime[k].source === 'tmdb');
  const fromAniList = allKeys.some((k) => anime[k].source !== 'tmdb');
  const credits = [fromAniList ? 'AniList' : null, fromTmdb ? 'TMDB' : null].filter(Boolean).join(' e ');
  ctx.fillText(credits ? `${APP_NAME} · dados: ${credits}` : APP_NAME, PAD, H - 16);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('could not encode PNG');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tierlist'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
