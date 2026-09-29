import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { placementsOf, recommendationsFor } from '../../shared/stats';
import { GROUP_BOARD } from '../../shared/types';
import { formatLabel } from '../lib/anime-api';
import { RECOMMEND, formatRating, ratingColor, readableOn } from '../lib/format';
import { useRoom } from './RoomContext';
import { Avatar, EmptyState, Segmented, cn } from './ui';

type SortMode = 'avg' | 'count' | 'recommended' | 'controversial' | 'recent';
type Filter = 'all' | 'unrated' | 'plan';

export function RankingTab() {
  const { room, me, summaries, titleOf, openAnime, noun, place } = useRoom();
  const [sort, setSort] = useState<SortMode>('avg');
  const [filter, setFilter] = useState<Filter>('all');

  const forMe = useMemo(() => recommendationsFor(room, me), [room, me]);

  const rows = useMemo(() => {
    let list = Object.values(room.anime).map((a) => ({ anime: a, sum: summaries[a.key], mine: room.reviews[a.key]?.[me] }));
    if (filter === 'unrated') list = list.filter((r) => r.mine?.rating == null);
    if (filter === 'plan') list = list.filter((r) => r.mine?.status === 'plan');
    const by = {
      avg: (x: (typeof list)[0], y: (typeof list)[0]) =>
        (y.sum?.avg ?? -1) - (x.sum?.avg ?? -1) || (y.sum?.count ?? 0) - (x.sum?.count ?? 0),
      count: (x: (typeof list)[0], y: (typeof list)[0]) =>
        (y.sum?.reviewers ?? 0) - (x.sum?.reviewers ?? 0) || (y.sum?.avg ?? -1) - (x.sum?.avg ?? -1),
      recommended: (x: (typeof list)[0], y: (typeof list)[0]) =>
        (y.sum?.yes ?? 0) - (y.sum?.no ?? 0) - ((x.sum?.yes ?? 0) - (x.sum?.no ?? 0)) || (y.sum?.avg ?? -1) - (x.sum?.avg ?? -1),
      controversial: (x: (typeof list)[0], y: (typeof list)[0]) => (y.sum?.spread ?? -1) - (x.sum?.spread ?? -1),
      recent: (x: (typeof list)[0], y: (typeof list)[0]) => y.anime.addedAt - x.anime.addedAt,
    }[sort];
    return list.sort(by);
  }, [room, summaries, me, sort, filter]);

  const groupTier = (key: string) => {
    const t = placementsOf(room, key)[GROUP_BOARD];
    return t ? room.tiers.find((x) => x.id === t) : undefined;
  };

  if (Object.keys(room.anime).length === 0) {
    return (
      <EmptyState icon="🏆" title="Ainda não há nada para ordenar">
        Adiciona {noun.many} {place.to} e dá-lhes nota: aqui aparece o ranking do grupo, {noun.f ? 'as' : 'os'} mais recomendad{noun.f ? 'as' : 'os'} e{' '}
        {noun.f ? 'as' : 'os'} mais polémic{noun.f ? 'as' : 'os'}.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      {forMe.length > 0 && (
        <section className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent-2/5 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Sparkles size={17} className="text-accent" /> Recomendados para ti
            <span className="text-xs font-normal text-muted">— os teus colegas recomendam e tu ainda não viste</span>
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {forMe.map((r) => {
              const a = room.anime[r.key];
              return (
                <button key={r.key} className="w-28 shrink-0 text-left" onClick={() => openAnime(r.key)}>
                  <img src={a.cover} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-lg object-cover shadow-lg" />
                  <p className="mt-1.5 line-clamp-2 text-xs leading-tight font-medium">{titleOf(a)}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="flex -space-x-1.5">
                      {r.by.slice(0, 4).map((u) => (
                        <Avatar key={u} member={room.members[u]} size={18} />
                      ))}
                    </span>
                    {r.avg != null && (
                      <span className="text-[11px] font-bold" style={{ color: ratingColor(r.avg) }}>
                        {formatRating(Math.round(r.avg * 10) / 10)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'avg', label: 'Melhor nota' },
            { value: 'count', label: 'Mais avaliados' },
            { value: 'recommended', label: 'Mais recomendados' },
            { value: 'controversial', label: 'Mais polémicos' },
            { value: 'recent', label: 'Recentes' },
          ]}
        />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'unrated', label: 'Sem a minha nota' },
            { value: 'plan', label: 'Quero ver' },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">Nada aqui com este filtro.</p>}
        {rows.map((r, i) => {
          const tier = groupTier(r.anime.key);
          const s = r.sum;
          return (
            <button
              key={r.anime.key}
              onClick={() => openAnime(r.anime.key)}
              className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-white/[0.025]"
            >
              <span className={cn('w-6 shrink-0 text-center text-sm font-bold', i < 3 ? 'text-fg' : 'text-faint')}>
                {i < 3 && sort === 'avg' && s?.avg != null ? ['🥇', '🥈', '🥉'][i] : i + 1}
              </span>
              <img src={r.anime.cover} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{titleOf(r.anime)}</p>
                <p className="truncate text-xs text-faint">
                  {[r.anime.year, formatLabel(r.anime.format)].filter(Boolean).join(' · ')}
                  {s && s.reviewers > 0 && (
                    <>
                      {' · '}
                      {RECOMMEND.yes.emoji} {s.yes} {RECOMMEND.maybe.emoji} {s.maybe} {RECOMMEND.no.emoji} {s.no}
                    </>
                  )}
                </p>
              </div>
              {tier && (
                <span
                  className="hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-black sm:inline"
                  style={{ background: tier.color, color: readableOn(tier.color) }}
                  title="Tier na tierlist do Grupo"
                >
                  {tier.label}
                </span>
              )}
              <div className="w-16 shrink-0 text-right">
                <p className="text-lg leading-none font-extrabold" style={{ color: ratingColor(s?.avg) }}>
                  {s?.avg != null ? formatRating(Math.round(s.avg * 10) / 10) : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-faint">
                  {s?.count ? `${s.count} ${s.count === 1 ? 'nota' : 'notas'}` : 'sem notas'}
                  {sort === 'controversial' && s?.spread != null ? ` · ±${formatRating(Math.round(s.spread * 10) / 10)}` : ''}
                </p>
              </div>
              <div className="hidden w-14 shrink-0 text-right sm:block" title="A tua nota">
                <p className="text-[10px] text-faint">tu</p>
                <p className="text-sm font-bold" style={{ color: ratingColor(r.mine?.rating) }}>
                  {r.mine?.rating ?? '—'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
