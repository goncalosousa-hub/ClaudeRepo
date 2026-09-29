// Photos are made smaller in the browser before they are sent: at most 1280 px (plus a 360 px version
// for lists), as JPEG. Drawing them again also drops the EXIF data, GPS location included.
import { LIMITS } from '../../shared/constants';
import { errorMessage } from './format';
import type { LocalUser } from './identity';

const FULL = 1280;
const THUMB = 360;

export class PhotoError extends Error {}

async function decode(file: File): Promise<{ source: CanvasImageSource; w: number; h: number; close: () => void }> {
  if (!file.type.startsWith('image/')) throw new PhotoError('Esse ficheiro não é uma imagem.');
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, w: bitmap.width, h: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Older browsers: through an <img>.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
    } catch {
      throw new PhotoError('Não foi possível abrir esta imagem (experimenta JPEG ou PNG).');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function draw(source: CanvasImageSource, w: number, h: number, max: number, maxBytes: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Transparent PNGs get a white background instead of black JPEG corners.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  for (const quality of [0.82, 0.72, 0.6, 0.45]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    // Base64 is 4/3 of the bytes.
    if ((data.length - 23) * 0.75 <= maxBytes) return { data, width, height };
  }
  throw new PhotoError('Esta imagem é demasiado grande.');
}

export async function preparePhoto(file: File) {
  const img = await decode(file);
  try {
    const full = draw(img.source, img.w, img.h, FULL, LIMITS.photoBytes);
    const thumb = draw(img.source, img.w, img.h, THUMB, LIMITS.photoThumbBytes);
    return { image: full.data, thumb: thumb.data, w: full.width, h: full.height };
  } finally {
    img.close();
  }
}

/** Sends a photo of a title; the server adds it to the room (everyone sees it at once). */
export async function uploadPhoto(roomId: string, user: LocalUser, key: string, file: File): Promise<void> {
  const photo = await preparePhoto(file);
  let res: Response;
  try {
    res = await fetch(`/api/rooms/${roomId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Member ${user.id}:${user.secret}` },
      body: JSON.stringify({ key, ...photo }),
    });
  } catch {
    throw new PhotoError('Sem ligação ao servidor.');
  }
  if (res.ok) return;
  const code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? '';
  throw new PhotoError(res.status === 413 ? 'Esta imagem é demasiado grande.' : errorMessage(code || 'server_error'));
}
