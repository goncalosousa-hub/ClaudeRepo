import { useEffect, useRef, useState } from 'react';
import { DoorOpen, Globe, Pencil, UserPlus } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import { timeAgo } from '../lib/format';
import { describePresence } from '../lib/presence-text';
import { ROOMS_PATH, navigate } from '../lib/router';
import { kindInfo } from '../lib/words';
import { Logo } from './Logo';
import { useRoom } from './RoomContext';
import { Avatar, Button, cn } from './ui';

export function RoomHeader({ onShare, onProfile }: { onShare: () => void; onProfile: () => void }) {
  const { room, me, user, snap, dispatch, titleOf, kind, openKindDialog } = useRoom();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setName(room.name);
  }, [room.name, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = () => {
    setEditing(false);
    const next = name.trim();
    if (next && next !== room.name) dispatch({ type: 'room.rename', name: next });
    else setName(room.name);
  };

  const ownerName = (room.createdBy && room.members[room.createdBy]?.name) || 'quem a criou';
  const others = Object.values(room.members)
    .filter((m) => m.id !== me)
    .sort((a, b) => Number(!!snap.presence[b.id]) - Number(!!snap.presence[a.id]) || a.name.localeCompare(b.name));
  const online = others.filter((m) => snap.presence[m.id]);
  // Online colleagues first, then the others greyed out.
  const shown = others.slice(0, 6);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1680px] items-center gap-3 px-3 sm:px-5">
        <Logo compact />
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              maxLength={LIMITS.roomName}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') {
                  setName(room.name);
                  setEditing(false);
                }
              }}
              className="w-full max-w-sm rounded-md border border-accent bg-surface-2 px-2 py-1 text-base font-semibold outline-none"
              aria-label="Nome da sala"
            />
          ) : room.createdBy === me ? (
            <button
              className="group flex max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/5"
              onClick={() => setEditing(true)}
              title="Mudar o nome da sala"
            >
              <span className="truncate text-base font-semibold">{room.name}</span>
              <Pencil size={13} className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
            </button>
          ) : (
            <p
              className="truncate px-1 py-0.5 text-base font-semibold"
              title={room.global ? undefined : `Só o dono da sala (${ownerName}) pode mudar o nome`}
            >
              {room.name}
            </p>
          )}
          <p className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
            <span className={cn('h-1.5 w-1.5 rounded-full', snap.status === 'joined' ? 'bg-ok' : 'animate-pulse bg-warn')} />
            {snap.status === 'joined' ? `${online.length + 1} online` : 'a religar…'} · {Object.keys(room.members).length}{' '}
            {Object.keys(room.members).length === 1 ? 'membro' : 'membros'}
            <span className="hidden sm:inline">
              {room.global ? (
                <> · 🌍 Espaço de toda a gente</>
              ) : (
                <>
                  {' · '}
                  {room.createdBy === me ? (
                    <button className="hover:text-fg hover:underline" onClick={openKindDialog} title="Mudar o tipo da sala">
                      {kindInfo(kind).emoji} {kindInfo(kind).label}
                    </button>
                  ) : (
                    <>
                      {kindInfo(kind).emoji} {kindInfo(kind).label}
                    </>
                  )}
                  {room.listed && ' · 🔓 Aberta'}
                </>
              )}
            </span>
          </p>
        </div>

        <div className="hidden items-center sm:flex">
          <div className="flex -space-x-2">
            {shown.map((m) => {
              const p = snap.presence[m.id];
              const seen = snap.lastSeen[m.id];
              return (
                <Avatar
                  key={m.id}
                  member={m}
                  size={32}
                  online={!!p}
                  className={cn('ring-2 ring-bg', !p && 'opacity-45 grayscale')}
                  title={
                    p
                      ? `${m.name} — ${describePresence(p, room, me, titleOf)}`
                      : `${m.name} — offline${seen ? `, visto ${timeAgo(seen)}` : ''}`
                  }
                />
              );
            })}
          </div>
          {others.length > shown.length && (
            <span className="ml-1 rounded-full bg-surface-3 px-2 py-1 text-xs text-muted">+{others.length - shown.length}</span>
          )}
        </div>

        {room.global ? (
          <Button variant="ghost" size="sm" onClick={() => navigate(ROOMS_PATH)} title="Salas: tierlists só com quem convidares">
            <DoorOpen size={16} /> <span className="hidden sm:inline">Salas</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} title="A comunidade: o espaço de toda a gente">
            <Globe size={16} /> <span className="hidden sm:inline">Comunidade</span>
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onShare}>
          <UserPlus size={16} />
          <span className="hidden sm:inline">Convidar</span>
        </Button>
        <button onClick={onProfile} className="rounded-full" aria-label="O teu perfil" title="O teu perfil">
          <Avatar member={user} size={34} />
        </button>
      </div>
    </header>
  );
}
