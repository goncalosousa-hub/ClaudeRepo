import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { CircleAlert } from 'lucide-react';
import { COMPANY } from '../../shared/brand';
import { communitySection } from '../../shared/constants';
import { newUser, type LocalUser } from '../lib/identity';
import { errorMessage } from '../lib/format';
import { forgetRoom } from '../lib/recent-rooms';
import { cacheRoom, cachedRoom, prefetchCommunity } from '../lib/room-cache';
import { RoomClient, type RoomSnapshot } from '../lib/room-client';
import { navigate } from '../lib/router';
import { Logo } from './Logo';
import { ProfileDialog } from './ProfileDialog';
import { CommunitySections, SyncBar } from './RoomHeader';
import { RoomView } from './RoomView';
import { Avatar, Button, Spinner } from './ui';

const idle: RoomSnapshot = {
  status: 'connecting',
  error: null,
  room: null,
  presence: {},
  lastSeen: {},
  flashes: {},
  pendingCount: 0,
  admin: false,
};
const noopSubscribe = () => () => {};

export function RoomPage({
  roomId,
  user,
  setUser,
}: {
  roomId: string;
  user: LocalUser | null;
  setUser: (u: LocalUser) => void;
}) {
  const community = !!communitySection(roomId);
  if (!user) {
    return (
      <>
        <Loading text={community ? `Bem-vindo à Comunidade ${COMPANY}! Diz-nos quem és.` : 'Antes de entrares, diz-nos quem és.'} />
        <ProfileDialog
          open
          required
          user={null}
          onSave={setUser}
          welcome={
            community
              ? `Na Comunidade ${COMPANY} partilhas filmes, séries, livros, restaurantes e sítios de que gostas: dás a tua nota, opinião e fotos, e vês o que os colegas recomendam.`
              : undefined
          }
        />
      </>
    );
  }
  return <ConnectedRoom roomId={roomId} user={user} setUser={setUser} />;
}

function ConnectedRoom({ roomId, user, setUser }: { roomId: string; user: LocalUser; setUser: (u: LocalUser) => void }) {
  const [client, setClient] = useState<RoomClient | null>(null);

  // Before the first paint, so a room seen before shows at once: no loading screen in between. On
  // the way out, its last state is kept for next time.
  useLayoutEffect(() => {
    const c = new RoomClient(roomId, user, { initial: cachedRoom(roomId) });
    setClient(c);
    return () => {
      const last = c.cacheable();
      if (last) cacheRoom(roomId, last);
      c.destroy();
    };
    // A new connection only when the room or the identity changes (not on name/colour edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user.id]);

  useEffect(() => {
    client?.updateUser(user);
  }, [client, user]);

  const snap = useSyncExternalStore(client?.subscribe ?? noopSubscribe, client?.getSnapshot ?? (() => idle));

  // Once in a community space, the other ones are fetched in the background (after this one's pictures).
  const joined = snap.status === 'joined';
  useEffect(() => {
    if (!joined || !communitySection(roomId)) return;
    const timer = setTimeout(() => prefetchCommunity(roomId), 1200);
    return () => clearTimeout(timer);
  }, [joined, roomId]);

  if (snap.status === 'error') {
    return (
      <ErrorScreen
        code={snap.error ?? 'server_error'}
        onNewProfile={
          snap.error === 'auth_failed'
            ? () => setUser(newUser(user.name, user.color, user.avatar))
            : undefined
        }
        onForget={snap.error === 'room_not_found' ? () => forgetRoom(roomId) : undefined}
      />
    );
  }
  if (!client || !snap.room) {
    if (communitySection(roomId)) return <CommunitySkeleton roomId={roomId} user={user} />;
    return <Loading text={snap.status === 'reconnecting' ? 'A religar…' : 'A entrar na sala…'} />;
  }
  return <RoomView client={client} snap={snap} user={user} setUser={setUser} />;
}

/**
 * A community space not seen yet: the page as it will look (header, sections, cards), so moving
 * between spaces never goes through a blank loading screen.
 */
function CommunitySkeleton({ roomId, user }: { roomId: string; user: LocalUser }) {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-[1680px] items-center gap-3 px-3 sm:px-5">
          <Logo compact />
          <div className="min-w-0 flex-1">
            <p className="truncate px-1 py-0.5 text-base font-semibold">Comunidade {COMPANY}</p>
            <p className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" /> a entrar…
            </p>
          </div>
          <Avatar member={user} size={34} />
        </div>
        <CommunitySections current={roomId} />
        <SyncBar />
      </header>
      <main className="mx-auto w-full max-w-[1680px] px-3 pt-6 sm:px-5">
        <div className="mb-5 h-7 w-56 animate-pulse rounded-lg bg-fg/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-fg/5" />
          ))}
        </div>
      </main>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> {text}
      </div>
    </div>
  );
}

function ErrorScreen({ code, onNewProfile, onForget }: { code: string; onNewProfile?: () => void; onForget?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6">
        <CircleAlert className="mx-auto mb-3 text-bad" size={34} />
        <p className="font-semibold">{code === 'room_not_found' ? 'Sala não encontrada' : 'Não foi possível entrar'}</p>
        <p className="mt-1 text-sm text-muted">{errorMessage(code)}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onNewProfile && (
            <Button variant="primary" onClick={onNewProfile}>
              Criar perfil novo
            </Button>
          )}
          <Button
            onClick={() => {
              onForget?.();
              navigate('/');
            }}
          >
            Voltar ao início
          </Button>
        </div>
      </div>
    </div>
  );
}
