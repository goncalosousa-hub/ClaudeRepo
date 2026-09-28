import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import type { Recommend, Review, WatchStatus } from '../../shared/types';
import { RECOMMEND, WATCH_STATUS, ratingColor } from '../lib/format';
import { useRoom } from './RoomContext';
import { Button, cn } from './ui';

/** "A tua avaliação": rating 1-10, recommendation, watch status and opinion (auto-saved). */
export function ReviewEditor({ animeKey }: { animeKey: string }) {
  const { room, me, dispatch, client } = useRoom();
  const review: Review | undefined = room.reviews[animeKey]?.[me];
  const [opinion, setOpinion] = useState(review?.opinion ?? '');
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle');
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(opinion);
  latest.current = opinion;

  // Keep in sync with changes made elsewhere (e.g. another tab) while not typing.
  useEffect(() => {
    if (!focused.current && timer.current == null) setOpinion(review?.opinion ?? '');
  }, [review?.opinion]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if ((review?.opinion ?? '') !== latest.current) {
      dispatch({ type: 'review.set', key: animeKey, patch: { opinion: latest.current } });
      setSaving('saved');
    } else if (saving === 'pending') setSaving('saved');
  };

  const stopTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    client.setPresence({ typing: null });
  };

  // Save & stop the typing indicator when the dialog closes.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        dispatch({ type: 'review.set', key: animeKey, patch: { opinion: latest.current } });
      }
      if (typingTimer.current) clearTimeout(typingTimer.current);
      client.setPresence({ typing: null });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animeKey],
  );

  const set = (patch: Partial<Pick<Review, 'rating' | 'recommend' | 'status'>>) =>
    dispatch({ type: 'review.set', key: animeKey, patch });

  const rating = review?.rating ?? null;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Nota</p>
        <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Nota de 1 a 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = rating === n;
            const within = rating != null && n <= rating;
            return (
              <button
                key={n}
                role="radio"
                aria-checked={active}
                onClick={() => set({ rating: active ? null : n })}
                className={cn(
                  'h-9 rounded-md text-sm font-bold transition',
                  within ? 'text-black' : 'bg-surface-3 text-muted hover:bg-line-2 hover:text-fg',
                  active && 'ring-2 ring-white/70',
                )}
                style={within ? { background: ratingColor(rating) } : undefined}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Recomendas?</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RECOMMEND) as Recommend[]).map((r) => {
              const active = review?.recommend === r;
              return (
                <button
                  key={r}
                  onClick={() => set({ recommend: active ? null : r })}
                  aria-pressed={active}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition',
                    active ? 'text-fg' : 'border-line bg-surface-2 text-muted hover:text-fg',
                  )}
                  style={active ? { borderColor: RECOMMEND[r].color, background: `${RECOMMEND[r].color}22` } : undefined}
                >
                  <span>{RECOMMEND[r].emoji}</span>
                  {RECOMMEND[r].label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(WATCH_STATUS) as WatchStatus[]).map((s) => {
              const active = review?.status === s;
              return (
                <button
                  key={s}
                  onClick={() => set({ status: active ? null : s })}
                  aria-pressed={active}
                  className={cn(
                    'flex h-9 items-center gap-1 rounded-lg border px-2.5 text-sm font-medium transition',
                    active ? 'border-accent bg-accent/15 text-fg' : 'border-line bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  <span className="text-xs">{WATCH_STATUS[s].emoji}</span>
                  {WATCH_STATUS[s].label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">A tua opinião</p>
          <span className="flex items-center gap-1 text-xs text-faint">
            {saving === 'pending' && 'A escrever…'}
            {saving === 'saved' && (
              <>
                <Check size={12} className="text-ok" /> Guardado
              </>
            )}
          </span>
        </div>
        <textarea
          value={opinion}
          maxLength={LIMITS.opinion}
          rows={3}
          placeholder="O que achaste? Sem spoilers, por favor 😉"
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            flush();
            stopTyping();
          }}
          onChange={(e) => {
            setOpinion(e.target.value);
            setSaving('pending');
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flush, 900);
            if (!typingTimer.current) client.setPresence({ typing: animeKey });
            else clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(stopTyping, 3000);
          }}
          className="w-full resize-y rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-faint">
            {opinion.length}/{LIMITS.opinion}
          </span>
          {review && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                if (timer.current) clearTimeout(timer.current);
                timer.current = null;
                setOpinion('');
                dispatch({ type: 'review.set', key: animeKey, patch: { rating: null, recommend: null, status: null, opinion: '' } });
              }}
            >
              <Trash2 size={12} /> Apagar a minha avaliação
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
