import { useId } from 'react';
import { acceptsMedia, mediaTypeOf } from '../../shared/media';
import type { MediaType, RoomKind } from '../../shared/types';
import { useTmdbAvailable } from '../hooks/useTmdb';
import { TMDB_OFF } from '../lib/tmdb-api';
import { KINDS, kindInfo, mediaNoun } from '../lib/words';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Modal, ModalHeader, cn } from './ui';

const ABOUT: Record<RoomKind, string> = {
  all: 'Filmes, séries e anime na mesma tierlist.',
  movies: 'Só filmes.',
  series: 'Só séries.',
  anime: 'Só anime.',
};

/** "3 animes e 1 série": the titles in the room that a room type would not take. */
function misfits(keys: string[], kind: RoomKind) {
  const count = new Map<MediaType, number>();
  for (const key of keys) {
    const media = mediaTypeOf(key);
    if (!acceptsMedia(kind, media)) count.set(media, (count.get(media) ?? 0) + 1);
  }
  const parts = [...count].map(([media, n]) => `${n} ${n === 1 ? mediaNoun(media).one : mediaNoun(media).many}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : (parts[0] ?? null);
}

/** The room owner picks what the room holds: everything, films, series or anime. */
export function RoomKindDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room, kind, me, dispatch } = useRoom();
  const toast = useToast();
  const tmdb = useTmdbAvailable();
  const id = useId();
  const owner = room.createdBy === me;
  const keys = Object.keys(room.anime);

  const choose = (next: RoomKind) => {
    if (next !== kind && dispatch({ type: 'room.kind', kind: next })) {
      toast(`Agora a sala é de: ${kindInfo(next).emoji} ${kindInfo(next).label}.`, 'success');
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label="Tipo da sala">
      <ModalHeader title="Tipo da sala" subtitle="O que se pode adicionar a esta sala." onClose={onClose} />
      <div className="space-y-2 px-5 py-5" role="radiogroup" aria-label="Tipo da sala">
        {KINDS.map((k) => {
          const blocked = k.id === kind ? null : misfits(keys, k.id);
          return (
            <button
              key={k.id}
              role="radio"
              aria-checked={k.id === kind}
              aria-labelledby={`${id}-${k.id}`}
              aria-describedby={`${id}-${k.id}-about`}
              disabled={!owner || !!blocked}
              onClick={() => choose(k.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                k.id === kind ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface-2 enabled:hover:border-line-2',
                (!owner || blocked) && k.id !== kind && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="text-2xl" aria-hidden>
                {k.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span id={`${id}-${k.id}`} className="block font-medium">
                  {k.label}
                </span>
                <span id={`${id}-${k.id}-about`} className="block text-xs text-muted">
                  {blocked ? `Não dá enquanto a sala tiver ${blocked}.` : ABOUT[k.id]}
                </span>
              </span>
            </button>
          );
        })}
        {!owner && <p className="pt-1 text-xs text-faint">Só o dono da sala pode mudar o tipo.</p>}
        {tmdb === false && kind !== 'anime' && <p className="pt-1 text-xs text-amber-200">{TMDB_OFF}</p>}
      </div>
    </Modal>
  );
}

/** "🎌 Esta sala é só de anime", with a way for the owner to change it. */
export function RoomKindHint({ before }: { before?: () => void }) {
  const { room, kind, me, openKindDialog } = useRoom();
  if (room.global || kind === 'all') return null;
  const info = kindInfo(kind);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
      <span>
        {info.emoji} Esta sala é só de {info.label.toLowerCase()}.
      </span>
      {room.createdBy === me ? (
        <button
          className="font-medium text-accent hover:underline"
          onClick={() => {
            before?.();
            openKindDialog();
          }}
        >
          Mudar o tipo da sala
        </button>
      ) : (
        <span>Só o dono da sala pode mudar isto.</span>
      )}
    </p>
  );
}
