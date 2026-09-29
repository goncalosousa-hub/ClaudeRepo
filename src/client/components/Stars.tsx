import { Star } from 'lucide-react';
import { formatStars, toStars } from '../lib/format';
import { cn } from './ui';

const GOLD = '#fbbf24';

/** 1 to 5 stars (with halves) for a rating from 1 to 10, optionally with the number next to them. */
export function Stars({
  rating,
  size = 16,
  number,
  className,
}: {
  rating: number | null | undefined;
  size?: number;
  number?: boolean;
  className?: string;
}) {
  const value = rating == null ? 0 : toStars(rating);
  const label = rating == null ? 'Sem estrelas' : `${formatStars(rating)} de 5 estrelas`;
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={label} title={label}>
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, value - (i - 1)));
          return (
            <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
              <Star size={size} className="absolute inset-0 text-fg/15" fill="currentColor" strokeWidth={0} />
              {fill > 0 && (
                <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.round(fill * 100)}%` }}>
                  <Star size={size} style={{ color: GOLD }} fill="currentColor" strokeWidth={0} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {number && rating != null && <span className="font-semibold text-fg">{formatStars(rating)}</span>}
    </span>
  );
}

/** Pick 1 to 5 stars (stored as 2, 4… 10). Pressing the chosen star again clears it. */
export function StarInput({ rating, onChange }: { rating: number | null; onChange: (rating: number | null) => void }) {
  // Old notes from 1 to 10 show as the nearest star.
  const chosen = rating == null ? 0 : Math.round(toStars(rating));
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Estrelas">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={chosen === n}
          aria-label={n === 1 ? '1 estrela' : `${n} estrelas`}
          onClick={() => onChange(chosen === n ? null : n * 2)}
          className="rounded-lg p-1 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Star size={36} style={{ color: n <= chosen ? GOLD : undefined }} className={n <= chosen ? undefined : 'text-fg/15'} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  );
}
