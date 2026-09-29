import { useEffect, useState } from 'react';
import { CommunityGate } from './components/CommunityGate';
import { AdminPage } from './components/AdminPage';
import { Home } from './components/Home';
import { PRIVACY_PATH, PrivacyPage } from './components/PrivacyPage';
import { RoomPage } from './components/RoomPage';
import { useToast } from './components/Toasts';
import { communityLocked } from './lib/community';
import { googleConfig, type GoogleConfig } from './lib/google';
import { importProfileFromHash, saveUser, useUser } from './lib/identity';
import { sectionAt, usePath } from './lib/router';

export function App() {
  const path = usePath();
  const [user, setUser] = useUser();
  const toast = useToast();
  // null while asking the server whether this browser still needs the community code.
  const [locked, setLocked] = useState<boolean | null>(null);
  // Whether colleagues can get in with Google instead (only asked when the code is needed).
  const [google, setGoogle] = useState<GoogleConfig | null>(null);

  useEffect(() => {
    void communityLocked().then(async (needsCode) => {
      if (needsCode) setGoogle(await googleConfig());
      setLocked(needsCode);
    });
  }, []);

  useEffect(() => {
    const imported = importProfileFromHash();
    if (imported) {
      saveUser(imported);
      toast(`Perfil "${imported.name}" importado neste dispositivo.`, 'success');
    }
  }, [toast]);

  // The privacy policy is for everyone, also without the community code (Google's sign-in links to it).
  if (path.replace(/\/+$/, '') === PRIVACY_PATH) return <PrivacyPage />;
  if (locked === null) return null;
  if (locked) return <CommunityGate google={google} onUnlocked={() => setLocked(false)} />;

  const room = path.match(/^\/r\/([a-z0-9]{6,16})\/?$/i);
  if (room) return <RoomPage key={room[1]} roomId={room[1].toLowerCase()} user={user} setUser={setUser} />;
  if (/^\/salas\/?$/.test(path)) return <Home user={user} setUser={setUser} />;
  if (/^\/admin\/?$/.test(path)) return <AdminPage user={user} setUser={setUser} />;
  const section = sectionAt(path);
  return <RoomPage key={section.id} roomId={section.id} user={user} setUser={setUser} />;
}
