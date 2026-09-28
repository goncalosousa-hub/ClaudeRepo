import { useEffect } from 'react';
import { Home } from './components/Home';
import { RoomPage } from './components/RoomPage';
import { useToast } from './components/Toasts';
import { importProfileFromHash, saveUser, useUser } from './lib/identity';
import { usePath } from './lib/router';

export function App() {
  const path = usePath();
  const [user, setUser] = useUser();
  const toast = useToast();

  useEffect(() => {
    const imported = importProfileFromHash();
    if (imported) {
      saveUser(imported);
      toast(`Perfil "${imported.name}" importado neste dispositivo.`, 'success');
    }
  }, [toast]);

  const room = path.match(/^\/r\/([a-z0-9]{6,16})\/?$/i);
  if (room) return <RoomPage key={room[1]} roomId={room[1].toLowerCase()} user={user} setUser={setUser} />;
  return <Home user={user} setUser={setUser} />;
}
