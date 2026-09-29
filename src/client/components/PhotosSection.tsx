import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import type { Photo } from '../../shared/types';
import { timeAgo } from '../lib/format';
import { PhotoError, uploadPhoto } from '../lib/photos';
import { photoUrl } from './Cover';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Avatar, Button, Spinner, cn } from './ui';

/** Everyone's photos of a title, and a button to add yours. */
export function PhotosSection({ animeKey }: { animeKey: string }) {
  const { room, me, user, snap, dispatch, memberName, member } = useRoom();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const photos: Photo[] = room.photos?.[animeKey] ?? [];
  const mine = photos.filter((p) => p.by === me).length;
  const left = LIMITS.photosPerMember - mine;
  // Whoever added a photo removes it; in a room also its owner, in the community the admins.
  const canRemove = (p: Photo) => p.by === me || (room.global ? snap.admin : room.createdBy === me);

  const send = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, Math.max(0, left));
    if (files && files.length > list.length) toast(`Cada pessoa pode pôr até ${LIMITS.photosPerMember} fotos por título.`, 'error');
    for (const file of list) {
      setSending((n) => n + 1);
      try {
        await uploadPhoto(room.id, user, animeKey, file);
      } catch (err) {
        toast(err instanceof PhotoError ? err.message : 'Não foi possível enviar a foto.', 'error');
      } finally {
        setSending((n) => n - 1);
      }
    }
  };

  const remove = (p: Photo) => {
    if (!confirm('Apagar esta foto?')) return;
    if (dispatch({ type: 'photo.remove', key: animeKey, id: p.id })) {
      setOpen(null);
      toast('Foto apagada.');
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Fotos {photos.length > 0 && <span className="font-normal text-muted">({photos.length})</span>}</h3>
        <Button size="sm" variant="subtle" className="ml-auto" onClick={() => input.current?.click()} disabled={left <= 0 || sending > 0}>
          {sending > 0 ? <Spinner size={14} /> : <Camera size={14} />} {sending > 0 ? 'A enviar…' : 'Adicionar fotos'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Escolher fotos"
          onChange={(e) => {
            void send(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-faint">Ainda não há fotos. Esteve lá? Mostra aos colegas!</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {photos.map((p, i) => (
            <button
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-surface-3"
              onClick={() => setOpen(i)}
              aria-label={`Foto de ${memberName(p.by)}`}
            >
              <img src={photoUrl(p.id)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              {member(p.by) && <Avatar member={member(p.by)!} size={20} className="absolute bottom-1 left-1 ring-2 ring-black/40" />}
            </button>
          ))}
        </div>
      )}
      {open != null && photos[open] && (
        <Lightbox
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onRemove={canRemove(photos[open]) ? () => remove(photos[open]) : undefined}
        />
      )}
    </section>
  );
}

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onRemove,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const { memberName } = useRoom();
  const ref = useRef<HTMLDialogElement>(null);
  const p = photos[index];
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label="Foto"
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/80">
          <span>
            {memberName(p.by)} · {timeAgo(p.at)} · {index + 1}/{photos.length}
          </span>
          {onRemove && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={onRemove}>
              <Trash2 size={14} /> Apagar
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('text-white/80 hover:bg-white/10 hover:text-white', !onRemove && 'ml-auto')}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </Button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
          <img src={photoUrl(p.id, false)} alt={`Foto de ${memberName(p.by)}`} className="max-h-full max-w-full rounded-lg object-contain" />
          {photos.length > 1 && (
            <>
              <button className="absolute left-2 rounded-full bg-black/60 p-2 text-white" onClick={() => go(-1)} aria-label="Anterior">
                <ChevronLeft size={22} />
              </button>
              <button className="absolute right-2 rounded-full bg-black/60 p-2 text-white" onClick={() => go(1)} aria-label="Seguinte">
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
