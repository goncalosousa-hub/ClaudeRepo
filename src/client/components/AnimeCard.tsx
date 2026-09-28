import { memo, type CSSProperties } from 'react';
import type { AnimeMeta, Member } from '../../shared/types';
import { formatRating, ratingColor } from '../lib/format';
import { Avatar, cn } from './ui';

export type CardSize = 'sm' | 'md' | 'lg';

export const CARD_SIZES: Record<CardSize, { w: number; h: number }> = {
  sm: { w: 58, h: 82 },
  md: { w: 74, h: 105 },
  lg: { w: 96, h: 136 },
};

export interface AnimeCardProps {
  anime: AnimeMeta;
  title: string;
  size: CardSize;
  rating?: number | null;
  /** Someone else is dragging this card */
  movedBy?: Member | null;
  /** Highlight colour after a remote change */
  flash?: string | null;
  viewers?: Member[];
  dimmed?: boolean;
  lifted?: boolean;
  badge?: string | null;
}

export const AnimeCardView = memo(function AnimeCardView({
  anime,
  title,
  size,
  rating,
  movedBy,
  flash,
  viewers,
  dimmed,
  lifted,
  badge,
}: AnimeCardProps) {
  const { w, h } = CARD_SIZES[size];
  const style: CSSProperties & Record<string, string | number> = { width: w, height: h };
  if (flash) style['--flash-color'] = flash;
  if (anime.color) style.backgroundColor = anime.color;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-3 shadow-md shadow-black/40 ring-1 ring-white/10 transition-[opacity,transform]',
        dimmed && 'opacity-30',
        lifted && 'scale-105 rotate-2 shadow-2xl shadow-black/60 ring-2 ring-accent',
        flash && 'animate-flash',
      )}
      style={style}
    >
      <img src={anime.cover} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-1 pt-5 pb-1">
        <p className={cn('line-clamp-2 leading-tight font-medium text-white', size === 'lg' ? 'text-[11px]' : 'text-[10px]')}>
          {title}
        </p>
      </div>
      {rating != null && (
        <span
          className="absolute top-1 left-1 rounded bg-black/80 px-1 text-[10px] leading-4 font-bold"
          style={{ color: ratingColor(rating) }}
          title="Nota média do grupo"
        >
          {formatRating(Math.round(rating * 10) / 10)}
        </span>
      )}
      {badge && (
        <span className="absolute top-1 right-1 rounded bg-black/80 px-1 text-[10px] leading-4 font-semibold text-white">
          {badge}
        </span>
      )}
      {!!viewers?.length && (
        <span className="absolute top-1 right-1 flex -space-x-1.5">
          {viewers.slice(0, 2).map((m) => (
            <Avatar key={m.id} member={m} size={16} title={`${m.name} está a ver`} />
          ))}
        </span>
      )}
      {movedBy && (
        <div className="absolute inset-0 rounded-lg" style={{ boxShadow: `inset 0 0 0 3px ${movedBy.color}` }}>
          <span
            className="absolute inset-x-0 top-0 truncate px-1 text-center text-[9px] leading-4 font-bold text-white"
            style={{ background: movedBy.color }}
          >
            {movedBy.name}
          </span>
        </div>
      )}
    </div>
  );
});
