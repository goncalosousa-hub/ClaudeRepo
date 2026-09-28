import { useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { mediaOfKind, mediaTypeOf } from '../../shared/media';
import type { AnimeMeta, MediaType } from '../../shared/types';
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
import { TMDB_PRESETS, TMDB_SORTS, catalogName, tmdbGenres } from '../lib/catalog';
import { formatNumber, formatRating, ratingColor } from '../lib/format';
import { MEDIA_TABS, agree, mediaNoun, none } from '../lib/words';
import { useBrowse, useDebounced, useInView } from '../hooks/useBrowse';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Button, Segmented, Select, Spinner, cn, inputClass } from './ui';

const YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1960 }, (_, i) => new Date().getFullYear() + 1 - i);
const MOVIE_YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1920 }, (_, i) => new Date().getFullYear() + 1 - i);

export function ExploreTab() {
  const { kind } = useRoom();
  const catalogs = mediaOfKind(kind);
  const [media, setMedia] = useState<MediaType>(catalogs[0]);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortKey | ''>('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('');
  const search = useDebounced(text.trim(), 400);
  const isAnime = media === 'anime';
  const noun = mediaNoun(media);

  const params: BrowseParams = {
    search: search || undefined,
    sort: (sort || (search ? 'relevance' : 'popularity')) as SortKey,
    genre: genre || undefined,
    year: year ? Number(year) : undefined,
    season: isAnime && year && season ? (season as Season) : undefined,
    format: isAnime ? format || undefined : undefined,
  };
  const { items, loading, error, hasMore, total, source, loadMore, retry } = useBrowse(media, params);
  const sentinel = useInView(loadMore, hasMore && !loading && !error);

  function reset(p: { sort?: SortKey; year?: string; season?: string } = {}) {
    setText('');
    setGenre('');
    setFormat('');
    setSort(p.sort ?? '');
    setYear(p.year ?? '');
    setSeason(p.season ?? '');
  }

  const now = currentSeason();
  const noFilters = !search && !year && !genre && !format;
  const presets: { label: string; apply: () => void; active: boolean }[] = isAnime
    ? [
        { label: '🔥 Em alta', active: noFilters && sort === 'trending', apply: () => reset({ sort: 'trending' }) },
        {
          label: '📅 Esta temporada',
          active: !search && year === String(now.year) && season === now.season,
          apply: () => reset({ sort: 'popularity', year: String(now.year), season: now.season }),
        },
        { label: '🏆 Melhores de sempre', active: noFilters && sort === 'score', apply: () => reset({ sort: 'score' }) },
        { label: '👑 Mais populares', active: noFilters && (sort === 'popularity' || sort === ''), apply: () => reset() },
      ]
    : TMDB_PRESETS[media].map((p) => ({
        label: p.label,
        active: noFilters && (sort || 'popularity') === p.sort,
        apply: () => reset({ sort: p.sort === 'popularity' ? undefined : p.sort }),
      }));

  const filtersActive = !!(genre || year || format || sort);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {catalogs.length > 1 && (
          <Segmented
            value={media}
            onChange={(m) => {
              setMedia(m);
              reset();
            }}
            options={catalogs.map((m) => ({ value: m, label: `${MEDIA_TABS[m].emoji} ${MEDIA_TABS[m].label}` }))}
          />
        )}
        <label className="relative block">
          <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
          <input
            className={`${inputClass} h-12 pl-11 text-base`}
            placeholder={`Pesquisar em ${noun.f ? 'todas as' : 'todos os'} ${noun.many}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Pesquisar ${noun.many}`}
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
          <Select label="Ordenar" value={isAnime || ['', 'score', 'newest'].includes(sort) ? sort : ''} onChange={(v) => setSort(v as SortKey | '')}>
            <option value="">{search ? 'Relevância' : 'Mais populares'}</option>
            {(isAnime ? SORTS.filter((s) => s.id !== 'popularity' || search) : TMDB_SORTS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select label="Género" value={genre} onChange={setGenre}>
            <option value="">Todos os géneros</option>
            {isAnime
              ? GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))
              : tmdbGenres(media).map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.label}
                  </option>
                ))}
          </Select>
          <Select label="Ano" value={year} onChange={setYear}>
            <option value="">Qualquer ano</option>
            {(media === 'movie' ? MOVIE_YEARS : YEARS).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          {isAnime && year && (
            <Select label="Temporada" value={season} onChange={setSeason}>
              <option value="">Ano inteiro</option>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
          {isAnime && (
            <Select label="Formato" value={format} onChange={setFormat}>
              <option value="">Todos os formatos</option>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={() => reset()}>
              <X size={14} /> Limpar filtros
            </Button>
          )}
        </div>
        <p className="text-xs text-faint">
          {total != null && items.length > 0 && (
            <>
              ≈ {formatNumber(total)} {noun.many} ·{' '}
            </>
          )}
          Fonte: {source === 'jikan' ? 'MyAnimeList (o AniList não está a responder)' : catalogName(media)}
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
        <p className="py-10 text-center text-sm text-muted">
          {none(noun)} {noun.one} {agree('encontrad', noun)} com estes filtros.
        </p>
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

/** "2019 · Série TV · 12 ep." */
export function metaLine(a: AnimeMeta) {
  return [a.year, formatLabel(a.format), a.episodes ? `${a.episodes} ep.` : null].filter(Boolean).join(' · ');
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
          <p className="mt-1 truncate text-xs text-faint">{metaLine(anime)}</p>
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
              if (dispatch({ type: 'anime.add', anime })) {
                toast(`«${title}» ${agree('adicionad', mediaNoun(mediaTypeOf(anime.key)))} à sala.`, 'success');
              }
            }}
          >
            <Plus size={14} /> Adicionar à sala
          </Button>
        )}
      </div>
    </div>
  );
}
