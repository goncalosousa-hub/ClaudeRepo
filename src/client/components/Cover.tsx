import { createContext, useContext } from 'react';
import { mediaTypeOf } from '../../shared/media';
import type { AnimeMeta, Photo } from '../../shared/types';
import { MEDIA_TABS } from '../lib/words';
import { cn } from './ui';

/** The room's photos (key -> photos). Its own context so covers only re-render when photos change. */
export const PhotosContext = createContext<Record<string, Photo[]> | undefined>(undefined);

export const photoUrl = (id: string, thumb = true) => `/api/photos/${id}${thumb ? '/thumb' : ''}`;

/** The catalogue picture, or else the first photo someone added (restaurants and places). */
export function useCoverUrl(meta: Pick<AnimeMeta, 'key' | 'cover'>, large = false): string {
  const photos = useContext(PhotosContext);
  const first = photos?.[meta.key]?.[0];
  return meta.cover || (first ? photoUrl(first.id, !large) : '');
}

/** A soft colour from the key, so each placeholder looks different. */
function hue(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

/**
 * The picture of a title. Without one (a book without a cover, a restaurant nobody photographed
 * yet) a coloured card with the category emoji, and the title when `label` is set.
 */
export function Cover({
  meta,
  className,
  label,
  large,
}: {
  meta: Pick<AnimeMeta, 'key' | 'cover' | 'title'>;
  className?: string;
  label?: boolean;
  large?: boolean;
}) {
  const src = useCoverUrl(meta, large);
  if (src) return <img src={src} alt="" loading="lazy" draggable={false} className={cn('object-cover', className)} />;
  const h = hue(meta.key);
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-1 overflow-hidden p-1 text-center', className)}
      style={{ background: `linear-gradient(160deg, hsl(${h} 45% 32%), hsl(${(h + 40) % 360} 50% 18%))` }}
      aria-hidden
    >
      <span className="text-2xl leading-none">{MEDIA_TABS[mediaTypeOf(meta.key)].emoji}</span>
      {label && <span className="line-clamp-3 text-[10px] leading-tight font-semibold text-white/90">{meta.title}</span>}
    </div>
  );
}
