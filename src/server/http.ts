import express, { type Request, type Response } from 'express';
import { isAllowedImageUrl } from '../shared/constants';
import { createRoomSchema, ROOM_ID_RE } from '../shared/schema';
import { lanAddresses } from './network';
import type { RoomManager } from './rooms';

/** Fixed-window rate limit per IP (in memory, good enough for a single server). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: () => void) => {
    const now = Date.now();
    const ip = req.ip ?? 'unknown';
    let h = hits.get(ip);
    if (!h || h.reset < now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(ip, h);
    }
    if (++h.count > max) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

/** Small in-memory cache for the image proxy (used when exporting a tier list as PNG). */
class ImageCache {
  private map = new Map<string, { type: string; body: Buffer }>();
  private bytes = 0;
  constructor(private maxBytes: number) {}
  get(key: string) {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }
  set(key: string, value: { type: string; body: Buffer }) {
    this.map.set(key, value);
    this.bytes += value.body.length;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(k);
      this.bytes -= v.body.length;
    }
  }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function apiRouter(rooms: RoomManager) {
  const router = express.Router();
  const images = new ImageCache(40 * 1024 * 1024);

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Local network addresses of this computer, so the invite link works for colleagues on the same
  // Wi-Fi when the host opened the app on "localhost". Only answered to the host machine itself.
  router.get('/network', (req, res) => {
    const remote = req.socket.remoteAddress ?? '';
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    const fromHost =
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) && ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!fromHost) {
      res.json({ lan: [] });
      return;
    }
    const port = req.socket.localPort;
    res.json({
      lan: lanAddresses().map((a) => ({ url: `http://${a.address}:${port}`, iface: a.iface, virtual: a.virtual })),
    });
  });

  router.post('/rooms', rateLimit(30, 10 * 60_000), async (req, res) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_name' });
      return;
    }
    const id = await rooms.create(parsed.data.name);
    res.status(201).json({ id });
  });

  router.get('/rooms/:id', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const room = ROOM_ID_RE.test(id) ? await rooms.get(id) : null;
    if (!room) {
      res.status(404).json({ error: 'room_not_found' });
      return;
    }
    const { state } = room.doc;
    res.json({
      id,
      name: state.name,
      members: Object.keys(state.members).length,
      anime: Object.keys(state.anime).length,
      online: rooms.onlineCount(room),
    });
  });

  // Same-origin copy of AniList / MyAnimeList images so they can be drawn on a <canvas>.
  router.get('/img', rateLimit(600, 60_000), async (req, res) => {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!isAllowedImageUrl(url)) {
      res.status(400).end();
      return;
    }
    const send = (img: { type: string; body: Buffer }) => {
      res.set({ 'Content-Type': img.type, 'Cache-Control': 'public, max-age=604800, immutable' }).send(img.body);
    };
    const cached = images.get(url);
    if (cached) return send(cached);
    try {
      const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !type.startsWith('image/')) {
        res.status(502).end();
        return;
      }
      if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
        res.status(413).end();
        return;
      }
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > MAX_IMAGE_BYTES) {
        res.status(413).end();
        return;
      }
      const img = { type, body };
      images.set(url, img);
      send(img);
    } catch {
      res.status(502).end();
    }
  });

  router.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return router;
}
