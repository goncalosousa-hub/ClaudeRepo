import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity as ActivityIcon, MessagesSquare, SendHorizontal } from 'lucide-react';
import { nanoid } from 'nanoid';
import { LIMITS } from '../../shared/constants';
import { mediaTypeOf } from '../../shared/media';
import { GROUP_BOARD, POOL, type Activity, type RoomKind } from '../../shared/types';
import { RECOMMEND, clockTime, statusInfo, timeAgo } from '../lib/format';
import { an, kindInfo, mediaNoun } from '../lib/words';
import { useRoom } from './RoomContext';
import { Avatar, cn } from './ui';

export type SidebarPanel = 'chat' | 'activity';

export function Sidebar({
  panel,
  setPanel,
  unreadChat,
  unreadActivity,
}: {
  panel: SidebarPanel;
  setPanel: (p: SidebarPanel) => void;
  unreadChat: number;
  unreadActivity: number;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex border-b border-line p-1">
        {(
          [
            { id: 'chat', label: 'Chat', icon: <MessagesSquare size={15} />, unread: unreadChat },
            { id: 'activity', label: 'Atividade', icon: <ActivityIcon size={15} />, unread: unreadActivity },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              panel === t.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t.icon}
            {t.label}
            {t.unread > 0 && panel !== t.id && (
              <span className="min-w-5 rounded-full bg-accent-2 px-1.5 text-[11px] leading-5 font-bold text-white">
                {t.unread > 99 ? '99+' : t.unread}
              </span>
            )}
          </button>
        ))}
      </div>
      {panel === 'chat' ? <ChatPanel /> : <ActivityPanel />}
    </div>
  );
}

function ChatPanel() {
  const { room, me, dispatch, client, snap, isOnline } = useRoom();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [room.chat.length]);

  useEffect(
    () => () => {
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        client.setPresence({ typing: null });
      }
    },
    [client],
  );

  const stopTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    client.setPresence({ typing: null });
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    stick.current = true;
    if (dispatch({ type: 'chat.send', id: nanoid(12), text: t })) setText('');
    stopTyping();
  };

  const typing = Object.values(snap.presence).filter((p) => p.typing === 'chat' && room.members[p.userId]);

  return (
    <>
      <div
        ref={listRef}
        className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {room.chat.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted">
            <span className="text-3xl">💬</span>
            <p>Ainda não há mensagens.</p>
            <p className="text-xs text-faint">Diz olá, discute tiers ou pede recomendações!</p>
          </div>
        )}
        {room.chat.map((msg, i) => {
          const prev = room.chat[i - 1];
          const grouped = prev && prev.by === msg.by && msg.at - prev.at < 5 * 60_000;
          const m = room.members[msg.by];
          const mine = msg.by === me;
          if (!m) return null;
          return (
            <div key={msg.id} className={cn('flex gap-2', !grouped && 'pt-2.5')}>
              <div className="w-7 shrink-0">{!grouped && <Avatar member={m} size={28} online={isOnline(m.id)} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && (
                  <p className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold" style={{ color: m.color }}>
                      {mine ? 'Tu' : m.name}
                    </span>
                    <span className="text-faint">{clockTime(msg.at)}</span>
                  </p>
                )}
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-5 px-4 text-[11px] text-muted">
        {typing.length > 0 && (
          <span className="animate-pulse">
            {typing.map((p) => room.members[p.userId].name).join(', ')} {typing.length === 1 ? 'está' : 'estão'} a escrever…
          </span>
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          rows={1}
          maxLength={LIMITS.chatText}
          placeholder="Escreve uma mensagem…"
          aria-label="Mensagem"
          onChange={(e) => {
            setText(e.target.value);
            if (!typingTimer.current) client.setPresence({ typing: 'chat' });
            else clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(stopTyping, 2500);
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-line-2 bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-accent to-accent-2 text-white transition disabled:opacity-40"
          aria-label="Enviar"
        >
          <SendHorizontal size={17} />
        </button>
      </form>
    </>
  );
}

function ActivityPanel() {
  const { room, place } = useRoom();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const items = useMemo(() => [...room.activity].reverse(), [room.activity]);

  if (!items.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted">
        <span className="text-3xl">📡</span>
        <p>Aqui aparece tudo o que acontece {place.in}, em direto.</p>
      </div>
    );
  }
  return (
    <ul className="flex-1 space-y-1 overflow-y-auto p-2">
      {items.map((a) => (
        <ActivityItem key={a.id} a={a} />
      ))}
    </ul>
  );
}

function ActivityItem({ a }: { a: Activity }) {
  const { room, me, titleOf, openAnime, memberName, place } = useRoom();
  const m = room.members[a.by];
  if (!m) return null;
  const anime = a.key ? room.anime[a.key] : undefined;
  const noun = mediaNoun(mediaTypeOf(a.key ?? ''));
  const animeName = (fallback?: string): ReactNode =>
    anime ? (
      <button className="font-semibold text-fg hover:underline" onClick={() => openAnime(anime.key)}>
        {titleOf(anime)}
      </button>
    ) : (
      <span className="font-semibold text-fg">{fallback ?? `${an(noun)} ${noun.one}`}</span>
    );
  const where = a.board === GROUP_BOARD ? 'no Grupo' : 'na tierlist pessoal';

  let body: ReactNode;
  switch (a.kind) {
    case 'join':
      body = <>entrou {place.in} 👋</>;
      break;
    case 'add':
      body = (
        <>
          adicionou {animeName()}
          {a.toLabel ? (
            <>
              {' '}
              em <b>{a.toLabel}</b> {where}
            </>
          ) : null}
        </>
      );
      break;
    case 'remove':
      body = (
        <>
          removeu {animeName(a.text)} {place.from}
        </>
      );
      break;
    case 'move':
      body =
        a.to === POOL ? (
          <>
            tirou {animeName()} dos tiers {where}
          </>
        ) : (
          <>
            pôs {animeName()} em <b className="text-fg">{a.toLabel ?? '?'}</b> {where}
          </>
        );
      break;
    case 'review': {
      const bits: string[] = [];
      if (a.rating != null) bits.push(`${a.rating}/10`);
      if (a.recommend) bits.push(`${RECOMMEND[a.recommend].emoji} ${RECOMMEND[a.recommend].short}`);
      if (a.status) {
        const st = statusInfo(mediaTypeOf(a.key ?? ''), a.status);
        bits.push(`${st.emoji} ${st.label}`);
      }
      if (a.opinion) bits.push('✍️ opinião');
      body = (
        <>
          avaliou {animeName()}
          {bits.length > 0 && <span className="text-muted"> · {bits.join(' · ')}</span>}
        </>
      );
      break;
    }
    case 'tiers':
      body = <>alterou os tiers da sala 🎨</>;
      break;
    case 'rename':
      body = (
        <>
          mudou o nome da sala para <b className="text-fg">«{a.text}»</b>
        </>
      );
      break;
    case 'copy':
      body = <>copiou a tierlist {a.to === GROUP_BOARD ? 'do Grupo' : `de ${memberName(a.to ?? '')}`} para a sua</>;
      break;
    case 'clear':
      body = <>limpou a sua tierlist</>;
      break;
    case 'kind': {
      const k = kindInfo(a.text as RoomKind);
      body = (
        <>
          mudou o tipo da sala para{' '}
          <b className="text-fg">
            {k.emoji} {k.label}
          </b>
        </>
      );
      break;
    }
    case 'photo':
      body = (
        <>
          {(a.count ?? 1) === 1 ? 'pôs uma foto de' : `pôs ${a.count} fotos de`} {animeName()} 📷
        </>
      );
      break;
    case 'listed':
      body = a.listed ? <>abriu a sala a todos os colegas 🔓</> : <>fechou a sala: agora só entra quem tiver o link 🔒</>;
      break;
    case 'owner':
      body =
        a.to === a.by ? (
          <>ficou com a sala 👑</>
        ) : (
          <>
            passou a sala a <b className="text-fg">{memberName(a.to ?? '')}</b> 👑
          </>
        );
      break;
  }

  return (
    <li className={cn('flex gap-2.5 rounded-lg px-2 py-2 text-[13px] leading-snug text-muted', a.by === me && 'bg-white/[0.02]')}>
      <Avatar member={m} size={24} />
      <div className="min-w-0 flex-1">
        <p>
          <span className="font-semibold" style={{ color: m.color }}>
            {a.by === me ? 'Tu' : m.name}
          </span>{' '}
          {body}
        </p>
        <p className="mt-0.5 text-[11px] text-faint">{timeAgo(a.at)}</p>
      </div>
    </li>
  );
}
