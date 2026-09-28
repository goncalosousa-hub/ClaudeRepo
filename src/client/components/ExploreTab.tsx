import { useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import type { AnimeMeta } from '../../shared/types';
import {
  FORMATS,
  GENRES,
  SEASONS,
  SORTS,
  currentSeason,
  formatLabel,
  genreLabel,
  type BrowseParams,
  type Season,
  type SortKey,
} from '../lib/anime-api';
import { formatNumber, formatRating, ratingColor } from '../lib/format';
import { useBrowse, useDebounced, useInView } from '../hooks/useBrowse';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Button, Select, Spinner, cn, inputClass } from './ui';

const YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1960 }, (_, i) => new Date().getFullYear() + 1 - i);

export function ExploreTab() {
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortKey | ''>('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('');
  const search = useDebounced(text.trim(), 400);

  const params: BrowseParams = {
    search: search || undefined,
    sort: (sort || (search ? 'relevance' : 'popularity')) as SortKey,
    genre: genre || undefined,
    year: year ? Number(year) : undefined,
    season: year && season ? (season as Season) : undefined,
    format: format || undefined,
  };
  const { items, loading, error, hasMore, total, source, loadMore, retry } = useBrowse(params);
  const sentinel = useInView(loadMore, hasMore && !loading && !error);

  const now = currentSeason();
  const presets: { label: string; apply: () => void; active: boolean }[] = [
    {
      label: '🔥 Em alta',
      active: !search && sort === 'trending' && !year && !genre,
      apply: () => reset({ sort: 'trending' }),
    },
    {
      label: '📅 Esta temporada',
      active: !search && year === String(now.year) && season === now.season,
      apply: () => reset({ sort: 'popularity', year: String(now.year), season: now.season }),
    },
    { label: '🏆 Melhores de sempre', active: !search && sort === 'score' && !year && !genre, apply: () => reset({ sort: 'score' }) },
    { label: '👑 Mais populares', active: !search && (sort === 'popularity' || sort === '') && !year && !genre && !format, apply: () => reset({}) },
  ];

  function reset(p: { sort?: SortKey; year?: string; season?: string }) {
    setText('');
    setGenre('');
    setFormat('');
    setSort(p.sort ?? '');
    setYear(p.year ?? '');
    setSeason(p.season ?? '');
  }

  const filtersActive = !!(genre || year || format || sort);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="relative block">
          <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input
            className={`${inputClass} h-12 pl-11 text-base`}
            placeholder="Pesquisar em todos os animes…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Pesquisar animes"
          />
          {text && (
            <button
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-faint hover:text-fg"
              onClick={() => setText('')}
              aria-label="Limpar pesquisa"
            >
              <X size={16} />
            </button>
          )}
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.apply}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-sm font-medium transition',
                p.active ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line bg-surface text-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select label="Ordenar" value={sort} onChange={(v) => setSort(v as SortKey | '')}>
            <option value="">{search ? 'Relevância' : 'Mais populares'}</option>
            {SORTS.filter((s) => s.id !== 'popularity' || search).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select label="Género" value={genre} onChange={setGenre}>
            <option value="">Todos os géneros</option>
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select label="Ano" value={year} onChange={setYear}>
            <option value="">Qualquer ano</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          {year && (
            <Select label="Temporada" value={season} onChange={setSeason}>
              <option value="">Ano inteiro</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
          <Select label="Formato" value={format} onChange={setFormat}>
            <option value="">Todos os formatos</option>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={() => reset({})}>
              <X size={14} /> Limpar filtros
            </Button>
          )}
        </div>
        <p className="text-xs text-faint">
          {total != null && items.length > 0 && <>≈ {formatNumber(total)} animes · </>}
          Fonte: {source === 'jikan' ? 'MyAnimeList (o AniList não está a responder)' : 'AniList'}
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {items.map((a) => (
          <ExploreCard key={a.key} anime={a} />
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">
          <p>{error}</p>
          <Button size="sm" className="mt-3" onClick={retry}>
            Tentar outra vez
          </Button>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">Nenhum anime encontrado com estes filtros.</p>
      )}
      {loading && (
        <div className="flex justify-center py-6 text-muted">
          <Spinner size={22} />
        </div>
      )}
      {hasMore && !loading && !error && (
        <div className="flex justify-center">
          <Button variant="subtle" onClick={loadMore}>
            Carregar mais
          </Button>
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}

function ExploreCard({ anime }: { anime: AnimeMeta }) {
  const { inRoom, dispatch, titleOf, openAnime, summaries } = useRoom();
  const toast = useToast();
  const key = inRoom(anime);
  const title = titleOf(anime);
  const groupAvg = key ? summaries[key]?.avg : null;

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:border-line-2 hover:shadow-xl hover:shadow-black/30"
      data-anime={anime.key}
    >
      <button className="block w-full text-left" onClick={() => openAnime(anime)} aria-label={`Ver ${title}`}>
        <div className="relative aspect-[2/3] w-full overflow-hidden" style={{ background: anime.color ?? '#1f1f2f' }}>
          <img src={anime.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          {anime.score != null && (
            <span className="absolute top-2 left-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
              ★ {anime.score}%
            </span>
          )}
          {groupAvg != null && (
            <span
              className="absolute top-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold"
              style={{ color: ratingColor(groupAvg) }}
              title="Nota média da sala"
            >
              {formatRating(Math.round(groupAvg * 10) / 10)}/10
            </span>
          )}
        </div>
        <div className="p-2.5">
          <p className="line-clamp-2 text-sm leading-snug font-semibold">{title}</p>
          <p className="mt-1 truncate text-xs text-faint">
            {[anime.year, formatLabel(anime.format), anime.episodes ? `${anime.episodes} ep.` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted">{anime.genres.slice(0, 3).map(genreLabel).join(' · ')}</p>
        </div>
      </button>
      <div className="px-2.5 pb-2.5">
        {key ? (
          <div className="flex h-8 items-center justify-center gap-1 rounded-lg bg-ok/10 text-xs font-semibold text-ok">
            <Check size={14} /> Na sala
          </div>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            className="w-full"
            onClick={() => {
              if (dispatch({ type: 'anime.add', anime })) toast(`«${title}» adicionado à sala.`, 'success');
            }}
          >
            <Plus size={14} /> Adicionar à sala
          </Button>
        )}
      </div>
    </div>
  );
}
