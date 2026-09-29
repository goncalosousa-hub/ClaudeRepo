import { useState } from 'react';
import { Check, PencilLine, Plus, Search } from 'lucide-react';
import { isPlaceMedia, mediaTypeOf } from '../../shared/media';
import type { AnimeMeta } from '../../shared/types';
import { SEARCH_EXAMPLES, catalogName } from '../lib/catalog';
import { MEDIA_TABS, agree, mediaNoun, none } from '../lib/words';
import { useBrowse, useDebounced, useInView } from '../hooks/useBrowse';
import { useCatalogTabs } from '../hooks/useTmdb';
import { CatalogOff, metaLine } from './ExploreTab';
import { useRoom } from './RoomContext';
import { RoomKindHint } from './RoomKindDialog';
import { Cover } from './Cover';
import { AddSpotDialog } from './AddSpotDialog';
import { useToast } from './Toasts';
import { Button, Modal, ModalHeader, Segmented, Spinner, inputClass } from './ui';

/**
 * Search the whole catalogue and add titles to the room. From "Recomendar" (`thenOpen`), choosing a
 * title also opens it, so the person gives their opinion straight away.
 */
export function QuickAddDialog({
  open,
  onClose,
  title,
  thenOpen,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  thenOpen?: boolean;
}) {
  const { kind, noun } = useRoom();
  const { catalogs, media, setMedia, waiting, off } = useCatalogTabs(kind);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const isSpot = isPlaceMedia(media);
  const search = useDebounced(text.trim(), 380);
  const ready = open && !waiting && !off;
  const { items, loading, error, hasMore, loadMore, retry } = useBrowse(media, search ? { search } : { sort: 'trending' }, ready);
  const sentinel = useInView(loadMore, ready && hasMore && !loading);
  const itemNoun = mediaNoun(media);
  const label = title ?? `Adicionar ${noun.one}`;

  const subtitle =
    catalogs.length > 1
      ? 'Filmes e séries do TMDB, anime do AniList.'
      : isSpot
        ? 'Procura no mapa (OpenStreetMap) ou adiciona à mão.'
        : `Pesquisa em todo o catálogo ${media === 'book' ? 'da' : 'do'} ${catalogName(media)}.`;

  return (
    <Modal open={open} onClose={onClose} label={label} className="max-w-xl">
      <ModalHeader title={label} subtitle={subtitle} onClose={onClose} />
      <div className="space-y-2 px-5 pt-4">
        {catalogs.length > 1 && (
          <Segmented
            size="sm"
            value={media}
            onChange={setMedia}
            options={catalogs.map((m) => ({ value: m, label: `${MEDIA_TABS[m].emoji} ${MEDIA_TABS[m].label}` }))}
          />
        )}
        <RoomKindHint before={onClose} />
        {!off && (
          <>
            <label className="relative block">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                autoFocus
                className={`${inputClass} pl-9`}
                placeholder={SEARCH_EXAMPLES[media]}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={`Pesquisar ${itemNoun.many}`}
              />
            </label>
            <p className="text-xs text-faint">{search ? 'Resultados' : isSpot ? '' : 'Em alta agora'}</p>
          </>
        )}
      </div>
      <div className="max-h-[55dvh] overflow-y-auto px-3 pt-1 pb-4">
        {off ? (
          <div className="pt-3">
            <CatalogOff onAnime={catalogs.includes('anime') ? () => setMedia('anime') : undefined} />
          </div>
        ) : waiting ? (
          <div className="flex justify-center py-5 text-muted">
            <Spinner />
          </div>
        ) : (
          <>
            {items.map((a) => (
              <QuickRow key={a.key} anime={a} onChosen={thenOpen ? onClose : undefined} />
            ))}
            {error && (
              <div className="px-2 py-6 text-center text-sm text-muted">
                <p>{error}</p>
                <Button size="sm" className="mt-3" onClick={retry}>
                  Tentar outra vez
                </Button>
              </div>
            )}
            {!loading && !error && items.length === 0 && !isSpot && (
              <p className="px-2 py-6 text-center text-sm text-muted">
                {none(itemNoun)} {itemNoun.one} {agree('encontrad', itemNoun)}.
              </p>
            )}
            {isSpot && !loading && (
              <div className="px-2 py-5 text-center text-sm text-muted">
                <p>
                  {search.length < 2
                    ? `Escreve o nome ${itemNoun.f ? 'da' : 'do'} ${itemNoun.one} ou a terra.`
                    : items.length === 0
                      ? 'Não está no mapa.'
                      : 'Não está na lista?'}
                </p>
                <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
                  <PencilLine size={14} /> Adicionar à mão
                </Button>
              </div>
            )}
            {loading && (
              <div className="flex justify-center py-5 text-muted">
                <Spinner />
              </div>
            )}
          </>
        )}
        <div ref={sentinel} />
      </div>
      {isSpot && (
        <AddSpotDialog
          open={adding}
          type={media === 'restaurant' ? 'restaurant' : 'place'}
          name={text.trim()}
          onClose={() => {
            setAdding(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function QuickRow({ anime, onChosen }: { anime: AnimeMeta; onChosen?: () => void }) {
  const { inRoom, dispatch, titleOf, openAnime, place } = useRoom();
  const toast = useToast();
  const already = inRoom(anime);
  const title = titleOf(anime);
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-fg/[0.04]" data-anime={anime.key}>
      <button className="shrink-0" onClick={() => openAnime(anime)} aria-label={`Ver ${title}`}>
        <Cover meta={anime} className="h-16 w-11 rounded-md" />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => openAnime(anime)}>
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-faint">{metaLine(anime)}</p>
      </button>
      {already && onChosen ? (
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            onChosen();
            openAnime(already);
          }}
        >
          <Check size={14} /> Já está: ver
        </Button>
      ) : already ? (
        <span className="flex items-center gap-1 text-xs font-medium text-ok">
          <Check size={14} /> {place.In}
        </span>
      ) : onChosen ? (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            if (!dispatch({ type: 'anime.add', anime })) return;
            onChosen();
            openAnime(anime);
          }}
        >
          Escolher
        </Button>
      ) : (
        <Button
          size="sm"
          variant="subtle"
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
  );
}
