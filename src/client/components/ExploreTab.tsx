import { useState } from 'react';
import { Check, PencilLine, Plus, Search, X } from 'lucide-react';
import { PLACE_KINDS } from '../../shared/catalog';
import { isPlaceMedia, mediaTypeOf } from '../../shared/media';
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
import { BOOK_PRESETS, SEARCH_EXAMPLES, TMDB_PRESETS, TMDB_SORTS, bookSubjects, catalogName, tmdbGenres } from '../lib/catalog';
import { formatNumber, formatStars } from '../lib/format';
import { MEDIA_TABS, agree, mediaNoun, none } from '../lib/words';
import { useBrowse, useDebounced, useInView } from '../hooks/useBrowse';
import { useCatalogTabs } from '../hooks/useTmdb';
import { TMDB_OFF } from '../lib/tmdb-api';
import { useRoom } from './RoomContext';
import { RoomKindHint } from './RoomKindDialog';
import { Cover } from './Cover';
import { AddSpotDialog } from './AddSpotDialog';
import { useToast } from './Toasts';
import { Button, Segmented, Select, Spinner, cn, inputClass } from './ui';

const YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1960 }, (_, i) => new Date().getFullYear() + 1 - i);
const MOVIE_YEARS = Array.from({ length: new Date().getFullYear() + 2 - 1920 }, (_, i) => new Date().getFullYear() + 1 - i);

export function ExploreTab() {
  const { kind } = useRoom();
  const { catalogs, media, setMedia, waiting, off } = useCatalogTabs(kind);
  const [text, setText] = useState('');
  const [sort, setSort] = useState<SortKey | ''>('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [season, setSeason] = useState('');
  const [format, setFormat] = useState('');
  const search = useDebounced(text.trim(), 400);
  const [adding, setAdding] = useState(false);
  const isAnime = media === 'anime';
  const isBook = media === 'book';
  // Restaurants and places: searched on the map, or added by hand.
  const isSpot = isPlaceMedia(media);
  const noun = mediaNoun(media);

  const params: BrowseParams = isSpot
    ? { search: search || undefined }
    : isBook
      ? { search: search || undefined, sort: (sort || (search ? 'relevance' : 'trending')) as SortKey, genre: genre || undefined }
      : {
          search: search || undefined,
          sort: (sort || (search ? 'relevance' : 'popularity')) as SortKey,
          genre: genre || undefined,
          year: year ? Number(year) : undefined,
          season: isAnime && year && season ? (season as Season) : undefined,
          format: isAnime ? format || undefined : undefined,
        };
  const ready = !waiting && !off;
  const { items, loading, error, hasMore, total, source, loadMore, retry } = useBrowse(media, params, ready);
  const sentinel = useInView(loadMore, ready && hasMore && !loading && !error);

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
    : isBook
      ? BOOK_PRESETS.map((p) => ({
          label: p.label,
          active: noFilters && (sort || 'trending') === p.sort,
          apply: () => reset({ sort: p.sort === 'trending' ? undefined : p.sort }),
        }))
      : media === 'tv' || media === 'movie'
        ? TMDB_PRESETS[media].map((p) => ({
            label: p.label,
            active: noFilters && (sort || 'popularity') === p.sort,
            apply: () => reset({ sort: p.sort === 'popularity' ? undefined : p.sort }),
          }))
        : [];

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
        <RoomKindHint />
        {!off && (
          <>
            <label className="relative block">
              <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
              <input
                className={`${inputClass} h-12 pl-11 text-base`}
                placeholder={isSpot ? SEARCH_EXAMPLES[media] : `Pesquisar em ${noun.f ? 'todas as' : 'todos os'} ${noun.many}…`}
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

            {presets.length > 0 && (
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
            )}

            {isBook && (
              <div className="flex flex-wrap items-center gap-2">
                <Select label="Género" value={genre} onChange={setGenre}>
                  <option value="">Todos os géneros</option>
                  {bookSubjects.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </Select>
                {filtersActive && (
                  <Button size="sm" variant="ghost" onClick={() => reset()}>
                    <X size={14} /> Limpar filtros
                  </Button>
                )}
              </div>
            )}

            {!isBook && !isSpot && (
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
            )}
            <p className="text-xs text-faint">
              {total != null && items.length > 0 && (
                <>
                  ≈ {formatNumber(total)} {noun.many} ·{' '}
                </>
              )}
              {isSpot
                ? 'Mapa: © contribuidores do OpenStreetMap'
                : `Fonte: ${source === 'jikan' ? 'MyAnimeList (o AniList não está a responder)' : catalogName(media)}`}
            </p>
          </>
        )}
      </div>

      {off ? (
        <CatalogOff
          onAnime={
            catalogs.includes('anime')
              ? () => {
                  setMedia('anime');
                  reset();
                }
              : undefined
          }
        />
      ) : waiting ? (
        <div className="flex justify-center py-6 text-muted">
          <Spinner size={22} />
        </div>
      ) : (
        <>
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
          {!loading && !error && items.length === 0 && !isSpot && (
            <p className="py-10 text-center text-sm text-muted">
              {none(noun)} {noun.one} {agree('encontrad', noun)} com estes filtros.
            </p>
          )}
          {isSpot && !loading && (
            <div className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
              <p>
                {search.length < 2
                  ? `Procura ${noun.f ? 'uma' : 'um'} ${noun.one} pelo nome ou pela terra.`
                  : items.length === 0
                    ? `Não ${noun.f ? 'a' : 'o'} encontrámos no mapa.`
                    : `Não ${noun.f ? 'é nenhuma' : 'é nenhum'} ${noun.f ? 'destas' : 'destes'}?`}
              </p>
              <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
                <PencilLine size={14} /> Adicionar à mão
              </Button>
            </div>
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
        </>
      )}
      <div ref={sentinel} />
      {isSpot && (
        <AddSpotDialog open={adding} type={media === 'restaurant' ? 'restaurant' : 'place'} name={text.trim()} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

/** Where series and movies would be, on a server without a TMDB key. */
export function CatalogOff({ onAnime }: { onAnime?: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted">
      <p>{TMDB_OFF}</p>
      {onAnime && (
        <Button size="sm" className="mt-3" onClick={onAnime}>
          🎌 Ver anime
        </Button>
      )}
    </div>
  );
}

/** "2019 · Série TV · 12 ep.", "1888 · Eça de Queirós · 716 pág.", "Restaurante · Leiria" */
export function metaLine(a: AnimeMeta) {
  const media = mediaTypeOf(a.key);
  if (media === 'book') return [a.year, a.studio, a.episodes ? `${a.episodes} pág.` : null].filter(Boolean).join(' · ');
  if (isPlaceMedia(media)) return [spotKind(a.format), a.place?.city].filter(Boolean).join(' · ');
  return [a.year, formatLabel(a.format), a.episodes ? `${a.episodes} ep.` : null].filter(Boolean).join(' · ');
}

function ExploreCard({ anime }: { anime: AnimeMeta }) {
  const { inRoom, dispatch, titleOf, openAnime, summaries, place } = useRoom();
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
          <Cover meta={anime} label className="h-full w-full" />
          {anime.score != null && (
            <span className="absolute top-2 left-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
              ★ {anime.score}%
            </span>
          )}
          {groupAvg != null && (
            <span
              className="absolute top-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-amber-300"
              title={`Média das estrelas ${place.from}`}
            >
              ★ {formatStars(groupAvg)}
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
            <Check size={14} /> {place.In}
          </div>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            className="w-full"
            aria-label={`Adicionar ${place.to}`}
            title={`Adicionar ${place.to}`}
            onClick={() => {
              if (dispatch({ type: 'anime.add', anime })) {
                toast(`«${title}» ${agree('adicionad', mediaNoun(mediaTypeOf(anime.key)))} ${place.to}.`, 'success');
              }
            }}
          >
            <Plus size={14} /> Adicionar
          </Button>
        )}
      </div>
    </div>
  );
}

/** "Restaurante", "Praia"… (OpenStreetMap kinds, or what someone wrote). */
export const spotKind = (format: string | null) => (format ? (PLACE_KINDS[format] ?? format) : null);
