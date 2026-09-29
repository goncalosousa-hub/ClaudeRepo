import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import type { MediaType, Recommend, Review } from '../../shared/types';
import { mediaTypeOf } from '../../shared/media';
import { RECOMMEND, statusOptions } from '../lib/format';
import { StarInput } from './Stars';
import { useRoom } from './RoomContext';
import { Button, cn } from './ui';

/** Big, plain labels: the app is for everyone, not only for people used to apps. */
const LABEL = 'mb-2 text-sm font-semibold text-fg';

/** "A tua opinião": stars, recommendation, watch status and a written opinion (saved as you type). */
const PLACEHOLDERS: Partial<Record<MediaType, string>> = {
  restaurant: 'Como foi? O prato que recomendas, o preço, o serviço…',
  place: 'Como foi? Dicas para quem lá for…',
};

/**
 * `done`: a button that saves right away and closes, so nobody is left wondering whether it was
 * saved. With `always`, it shows even before anything was written (e.g. "Publicar" a new title).
 * `onDone` is told whether the person gave any opinion.
 */
export function ReviewEditor({
  animeKey,
  done,
}: {
  animeKey: string;
  done?: { label: string; always?: boolean; onDone: (withOpinion: boolean) => void };
}) {
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
        <p className={LABEL}>Quantas estrelas dás?</p>
        <StarInput rating={rating} onChange={(r) => set({ rating: r })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className={LABEL}>Recomendas aos colegas?</p>
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
          <p className={LABEL}>Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions(mediaTypeOf(animeKey)).map(({ id: s, label, emoji }) => {
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
                  <span className="text-xs">{emoji}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-fg">Escreve o que achaste</p>
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
          placeholder={PLACEHOLDERS[mediaTypeOf(animeKey)] ?? 'O que achaste? Sem spoilers, por favor 😉'}
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

      {done && (done.always || review || opinion.trim()) && (
        // Stays at the bottom of the details while the opinion is on screen (edge to edge of its box).
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex justify-end rounded-b-xl border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <Button
            variant="primary"
            onClick={() => {
              flush();
              stopTyping();
              done.onDone(!!review || !!latest.current.trim());
            }}
          >
            <Check size={16} /> {done.label}
          </Button>
        </div>
      )}
    </div>
  );
}
