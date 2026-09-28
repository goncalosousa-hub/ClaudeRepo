import { useEffect, useState } from 'react';
import { GLOBAL_ROOM_ID } from '../shared/constants';
import { CommunityGate } from './components/CommunityGate';
import { Home } from './components/Home';
import { RoomPage } from './components/RoomPage';
import { useToast } from './components/Toasts';
import { communityLocked } from './lib/community';
import { importProfileFromHash, saveUser, useUser } from './lib/identity';
import { usePath } from './lib/router';

export function App() {
  const path = usePath();
  const [user, setUser] = useUser();
  const toast = useToast();
  // null while asking the server whether this browser still needs the community code.
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    void communityLocked().then(setLocked);
  }, []);

  useEffect(() => {
    const imported = importProfileFromHash();
    if (imported) {
      saveUser(imported);
      toast(`Perfil "${imported.name}" importado neste dispositivo.`, 'success');
    }
  }, [toast]);

  if (locked === null) return null;
  if (locked) return <CommunityGate onUnlocked={() => setLocked(false)} />;

  const room = path.match(/^\/r\/([a-z0-9]{6,16})\/?$/i);
  if (room) return <RoomPage key={room[1]} roomId={room[1].toLowerCase()} user={user} setUser={setUser} />;
  if (/^\/salas\/?$/.test(path)) return <Home user={user} setUser={setUser} />;
  return <RoomPage key={GLOBAL_ROOM_ID} roomId={GLOBAL_ROOM_ID} user={user} setUser={setUser} />;
}
