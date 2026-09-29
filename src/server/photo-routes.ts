// Photos of titles (mostly restaurants and places). The browser resizes each photo and sends it here
// with a small version for lists; the server keeps both and adds the photo to the room (photo.add).
import express from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { LIMITS } from '../shared/constants';
import { OpError } from '../shared/ops';
import { ANIME_KEY_RE, ROOM_ID_RE } from '../shared/schema';
import type { Op, OpEnvelope } from '../shared/types';
import { rateLimit } from './http';
import type { LiveRoom, RoomManager } from './rooms';
import type { Storage } from './storage';

/** The upload route takes bigger bodies than the rest of the API. */
export const PHOTO_UPLOAD_PATH = /^\/api\/rooms\/[a-z0-9]{6,16}\/photos$/;
export const PHOTO_BODY_LIMIT = '3mb';

const uploadSchema = z.object({
  key: z.string().regex(ANIME_KEY_RE),
  image: z.string().max(Math.ceil((LIMITS.photoBytes * 4) / 3) + 8),
  thumb: z.string().max(Math.ceil((LIMITS.photoThumbBytes * 4) / 3) + 8),
  w: z.number().int().min(1).max(4096),
  h: z.number().int().min(1).max(4096),
});

/** "Member <user id>:<secret>": the same identity the browser uses in the room. */
function memberAuth(header: string | undefined): { userId: string; secret: string } | null {
  const m = /^Member ([A-Za-z0-9_-]{8,32}):([A-Za-z0-9_-]{16,64})$/.exec(header ?? '');
  return m ? { userId: m[1], secret: m[2] } : null;
}

/** Base64 of a JPEG (plain or as a data: URL) → bytes, or null when it is not one. */
function jpeg(value: string, max: number): Buffer | null {
  const b64 = value.replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Buffer.from(b64, 'base64');
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return isJpeg && bytes.length <= max ? bytes : null;
}

export interface PhotoRouterOptions {
  /** Space for all the photos together, in bytes */
  maxBytes: number;
  /** Applies an op and sends it to everyone in the room */
  publish: (room: LiveRoom, op: Op, by: string) => OpEnvelope;
}

export function photoRouter(rooms: RoomManager, storage: Storage, opts: PhotoRouterOptions) {
  const router = express.Router();
  // Counted once, then kept up to date (deletions only make room, so an estimate on the high side is fine).
  let used: Promise<number> | null = null;
  const usedBytes = async () => {
    used ??= storage.photoBytes();
    try {
      return await used;
    } catch {
      used = null;
      return 0;
    }
  };

  router.post('/rooms/:id/photos', rateLimit(60, 10 * 60_000), express.json({ limit: PHOTO_BODY_LIMIT }), async (req, res) => {
    const auth = memberAuth(req.headers.authorization);
    const parsed = uploadSchema.safeParse(req.body);
    const roomId = String(req.params.id);
    if (!auth || !parsed.success || !ROOM_ID_RE.test(roomId)) return void res.status(400).json({ error: 'invalid_request' });
    const room = await rooms.get(roomId);
    if (!room) return void res.status(404).json({ error: 'room_not_found' });
    if (!rooms.isMember(room, auth.userId, auth.secret)) return void res.status(403).json({ error: 'auth_failed' });
    const { key, w, h } = parsed.data;
    if (!room.doc.state.anime[key]) return void res.status(404).json({ error: 'anime_not_found' });

    const data = jpeg(parsed.data.image, LIMITS.photoBytes);
    const thumb = jpeg(parsed.data.thumb, LIMITS.photoThumbBytes);
    if (!data || !thumb) return void res.status(400).json({ error: 'invalid_image' });
    const size = data.length + thumb.length;
    const total = await usedBytes();
    if (total + size > opts.maxBytes) return void res.status(507).json({ error: 'photos_full' });

    const id = nanoid();
    await storage.savePhoto({ id, roomId, key, userId: auth.userId, data, thumb });
    try {
      opts.publish(room, { type: 'photo.add', key, photo: { id, w, h } }, auth.userId);
    } catch (err) {
      await storage.deletePhotos([id]).catch(() => {});
      if (err instanceof OpError) return void res.status(409).json({ error: err.code });
      throw err;
    }
    used = Promise.resolve(total + size);
    res.status(201).json({ id, w, h });
  });

  const serve = (thumb: boolean) => async (req: express.Request, res: express.Response) => {
    const img = await storage.loadPhoto(String(req.params.id), thumb);
    if (!img) return void res.status(404).json({ error: 'not_found' });
    // A photo never changes: its id is new every time.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.type('image/jpeg').send(img);
  };
  router.get('/photos/:id', serve(false));
  router.get('/photos/:id/thumb', serve(true));

  return router;
}
