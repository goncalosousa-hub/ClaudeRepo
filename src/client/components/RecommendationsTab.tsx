import { useMemo, useState } from 'react';
import { Camera, Plus, Search, Sparkles } from 'lucide-react';
import { mediaOfKind, mediaTypeOf } from '../../shared/media';
import { recommendationsFor } from '../../shared/stats';
import type { MediaType, RoomAnime } from '../../shared/types';
import { plural } from '../lib/format';
import { MEDIA_TABS, recommendLabel } from '../lib/words';
import { Cover } from './Cover';
import { metaLine } from './ExploreTab';
import { QuickAddDialog } from './QuickAddDialog';
import { useRoom } from './RoomContext';
import { Stars } from './Stars';
import { Avatar, Button, Segmented, cn, inputClass } from './ui';

type Sort = 'recent' | 'best' | 'talked';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recentes' },
  { value: 'best', label: 'Mais estrelas' },
  { value: 'talked', label: 'Mais comentados' },
];

/**
 * The home of every space: the titles people recommend, as simple cards (picture, stars, how many
 * recommend it, the latest opinion). Nothing to drag: tap a card to read the opinions and give yours.
 */
export function RecommendationsTab() {
  const { room, me, summaries, titleOf, openAnime, kind, place, noun } = useRoom();
  const [sort, setSort] = useState<Sort>('recent');
  const [media, setMedia] = useState<MediaType | 'all'>('all');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  const all = Object.values(room.anime);
  const forMe = useMemo(() => recommendationsFor(room, me).slice(0, 12), [room, me]);
  // Films, series and anime together: filter by kind when there is more than one.
  const present = mediaOfKind(kind).filter((m) => all.some((a) => mediaTypeOf(a.key) === m));

  const cards = useMemo(() => {
    const lastChange = (a: RoomAnime) =>
      Math.max(
        a.addedAt,
        ...Object.values(room.reviews[a.key] ?? {}).map((r) => r.updatedAt),
        ...(room.photos?.[a.key] ?? []).map((p) => p.at),
      );
    const talk = (a: RoomAnime) =>
      Object.values(room.reviews[a.key] ?? {}).filter((r) => r.opinion.trim()).length + (room.photos?.[a.key]?.length ?? 0);
    const q = text.trim().toLocaleLowerCase('pt');
    const list = all
      .filter((a) => media === 'all' || mediaTypeOf(a.key) === media)
      .filter((a) => !q || titleOf(a).toLocaleLowerCase('pt').includes(q) || (a.place?.city ?? '').toLocaleLowerCase('pt').includes(q))
      .map((a) => ({ a, last: lastChange(a), talk: talk(a), sum: summaries[a.key] }));
    const by = {
      recent: (x: (typeof list)[0], y: (typeof list)[0]) => y.last - x.last,
      best: (x: (typeof list)[0], y: (typeof list)[0]) =>
        (y.sum?.avg ?? -1) - (x.sum?.avg ?? -1) || (y.sum?.count ?? 0) - (x.sum?.count ?? 0) || y.last - x.last,
      talked: (x: (typeof list)[0], y: (typeof list)[0]) => y.talk - x.talk || y.last - x.last,
    }[sort];
    return list.sort(by);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, summaries, sort, media, text]);

  const label = recommendLabel(kind);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">Recomendações</h2>
          <p className="text-sm text-muted">
            O que os colegas recomendam. Carrega {noun.f ? 'numa' : 'num'} {noun.one} para ler as opiniões e dar a tua.
          </p>
        </div>
        <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => setAdding(true)}>
          <Plus size={20} /> {label}
        </Button>
      </div>

      {/* With a short list the cards already say it all. */}
      {forMe.length > 0 && all.length > 6 && (
        <section className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent-2/5 p-4">
          <h3 className="mb-3 flex flex-wrap items-center gap-x-2 font-semibold">
            <Sparkles size={17} className="text-accent" /> Os colegas recomendam-te
            <span className="text-xs font-normal text-muted">e ainda não deste a tua opinião</span>
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {forMe.map((r) => {
              const a = room.anime[r.key];
              return (
                <button key={r.key} className="w-28 shrink-0 text-left" onClick={() => openAnime(r.key)}>
                  <Cover meta={a} label className="aspect-[2/3] w-full rounded-lg shadow-lg" />
                  <p className="mt-1.5 line-clamp-2 text-xs leading-tight font-medium">{titleOf(a)}</p>
                  <span className="mt-1 flex -space-x-1.5">
                    {r.by.slice(0, 4).map((u) => (
                      <Avatar key={u} member={room.members[u]} size={18} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {all.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            className="max-w-full overflow-x-auto"
            value={sort}
            onChange={setSort}
            options={SORTS.map((o) => ({ value: o.value, label: <span className="whitespace-nowrap">{o.label}</span> }))}
          />
          {present.length > 1 && (
            <Segmented
              className="max-w-full overflow-x-auto"
              value={media}
              onChange={setMedia}
              options={[
                { value: 'all' as const, label: 'Todos' },
                ...present.map((m) => ({ value: m, label: `${MEDIA_TABS[m].emoji} ${MEDIA_TABS[m].label}` })),
              ]}
            />
          )}
          {all.length > 8 && (
            <label className="relative min-w-48 flex-1">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Procurar na lista…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Procurar na lista"
              />
            </label>
          )}
        </div>
      )}

      {all.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-4xl">✨</p>
          <p className="mt-2 text-lg font-semibold">Ainda não há recomendações {place.in}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Sê o primeiro: carrega em «{label}», escolhe e diz o que achaste. Toda a gente vai ver.
          </p>
          <Button variant="primary" size="lg" className="mt-4" onClick={() => setAdding(true)}>
            <Plus size={20} /> {label}
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nada na lista com «{text}».</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {cards.map(({ a }) => (
            <RecommendationCard key={a.key} anime={a} />
          ))}
        </div>
      )}

      <QuickAddDialog open={adding} onClose={() => setAdding(false)} title={label} thenOpen />
    </div>
  );
}

function RecommendationCard({ anime }: { anime: RoomAnime }) {
  const { room, me, summaries, titleOf, openAnime, memberName } = useRoom();
  const key = anime.key;
  const title = titleOf(anime);
  const sum = summaries[key];
  const reviews = Object.entries(room.reviews[key] ?? {}).filter(([u]) => room.members[u]);
  const latest = reviews.filter(([, r]) => r.opinion.trim()).sort((x, y) => y[1].updatedAt - x[1].updatedAt)[0];
  const mine = room.reviews[key]?.[me];
  const photos = room.photos?.[key]?.length ?? 0;
  const open = () => openAnime(key);

  return (
    <article className="flex gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:border-line-2" data-anime={key}>
      <button className="shrink-0" onClick={open} aria-label={`Ver ${title}`}>
        <Cover meta={anime} label className="h-36 w-24 rounded-xl sm:h-40 sm:w-28" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <button className="text-left" onClick={open}>
          <h3 className="text-base leading-snug font-semibold sm:text-lg">{title}</h3>
        </button>
        <p className="truncate text-sm text-muted">{metaLine(anime)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {sum?.avg != null ? <Stars rating={sum.avg} number /> : <span className="text-faint">Ainda sem estrelas</span>}
          <span className="text-muted">· {plural(reviews.length, 'opinião', 'opiniões')}</span>
        </div>
        {!!sum?.yes && <p className="mt-0.5 text-sm">👍 {sum.yes === 1 ? '1 recomenda' : `${sum.yes} recomendam`}</p>}
        {latest && (
          <p className="mt-2 line-clamp-2 text-sm text-fg/90">
            «{latest[1].opinion.trim()}» <span className="text-muted">— {memberName(latest[0])}</span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Button size="sm" variant={mine ? 'subtle' : 'primary'} onClick={open}>
            {mine ? 'Ver opiniões' : 'Dar a minha opinião'}
          </Button>
          {mine?.rating != null && (
            <span className="flex items-center gap-1 text-xs text-muted">
              A tua: <Stars rating={mine.rating} size={13} />
            </span>
          )}
          {photos > 0 && (
            <span className={cn('ml-auto flex items-center gap-1 text-xs text-muted')}>
              <Camera size={14} /> {photos}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
