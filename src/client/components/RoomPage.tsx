import { useEffect, useState, useSyncExternalStore } from 'react';
import { CircleAlert } from 'lucide-react';
import { COMPANY } from '../../shared/brand';
import { communitySection } from '../../shared/constants';
import { newUser, type LocalUser } from '../lib/identity';
import { errorMessage } from '../lib/format';
import { forgetRoom } from '../lib/recent-rooms';
import { RoomClient, type RoomSnapshot } from '../lib/room-client';
import { navigate } from '../lib/router';
import { Logo } from './Logo';
import { ProfileDialog } from './ProfileDialog';
import { RoomView } from './RoomView';
import { Button, Spinner } from './ui';

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

  useEffect(() => {
    const c = new RoomClient(roomId, user);
    setClient(c);
    return () => c.destroy();
    // A new connection only when the room or the identity changes (not on name/colour edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user.id]);

  useEffect(() => {
    client?.updateUser(user);
  }, [client, user]);

  const snap = useSyncExternalStore(client?.subscribe ?? noopSubscribe, client?.getSnapshot ?? (() => idle));

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
    const entering = communitySection(roomId) ? 'A entrar na comunidade…' : 'A entrar na sala…';
    return <Loading text={snap.status === 'reconnecting' ? 'A religar…' : entering} />;
  }
  return <RoomView client={client} snap={snap} user={user} setUser={setUser} />;
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
