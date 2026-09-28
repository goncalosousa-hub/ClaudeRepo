import { useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import type { AnimeMeta } from '../../shared/types';
import { formatLabel } from '../lib/anime-api';
import { useBrowse, useDebounced, useInView } from '../hooks/useBrowse';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Button, Modal, ModalHeader, Spinner, inputClass } from './ui';

/** Search the whole catalogue and add anime to the room without leaving the tier list. */
export function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 380);
  const { items, loading, error, hasMore, loadMore, retry } = useBrowse(
    search ? { search } : { sort: 'trending' },
    open,
  );
  const sentinel = useInView(loadMore, open && hasMore && !loading);

  return (
    <Modal open={open} onClose={onClose} label="Adicionar anime" className="max-w-xl">
      <ModalHeader title="Adicionar anime" subtitle="Pesquisa em todo o catálogo do AniList." onClose={onClose} />
      <div className="px-5 pt-4">
        <label className="relative block">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            autoFocus
            className={`${inputClass} pl-9`}
            placeholder="Ex.: Frieren, One Piece, Shingeki no Kyojin…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="mt-2 text-xs text-faint">{search ? 'Resultados' : 'Em alta agora'}</p>
      </div>
      <div className="max-h-[55dvh] overflow-y-auto px-3 pt-1 pb-4">
        {items.map((a) => (
          <QuickRow key={a.key} anime={a} />
        ))}
        {error && (
          <div className="px-2 py-6 text-center text-sm text-muted">
            <p>{error}</p>
            <Button size="sm" className="mt-3" onClick={retry}>
              Tentar outra vez
            </Button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted">Nenhum anime encontrado.</p>
        )}
        {loading && (
          <div className="flex justify-center py-5 text-muted">
            <Spinner />
          </div>
        )}
        <div ref={sentinel} />
      </div>
    </Modal>
  );
}

function QuickRow({ anime }: { anime: AnimeMeta }) {
  const { inRoom, dispatch, titleOf, openAnime } = useRoom();
  const toast = useToast();
  const already = inRoom(anime);
  const title = titleOf(anime);
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]" data-anime={anime.key}>
      <button className="shrink-0" onClick={() => openAnime(anime)} aria-label={`Ver ${title}`}>
        <img src={anime.cover} alt="" loading="lazy" className="h-16 w-11 rounded-md object-cover" />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => openAnime(anime)}>
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-faint">
          {[anime.year, formatLabel(anime.format), anime.episodes ? `${anime.episodes} ep.` : null].filter(Boolean).join(' · ')}
        </p>
      </button>
      {already ? (
        <span className="flex items-center gap-1 text-xs font-medium text-ok">
          <Check size={14} /> Na sala
        </span>
      ) : (
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            if (dispatch({ type: 'anime.add', anime })) toast(`«${title}» adicionado à sala.`, 'success');
          }}
        >
          <Plus size={14} /> Adicionar
        </Button>
      )}
    </div>
  );
}
