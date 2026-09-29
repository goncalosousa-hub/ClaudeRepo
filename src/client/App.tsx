import { useEffect, useState } from 'react';
import { CommunityGate } from './components/CommunityGate';
import { AdminPage } from './components/AdminPage';
import { Home } from './components/Home';
import { PRIVACY_PATH, PrivacyPage } from './components/PrivacyPage';
import { RoomPage } from './components/RoomPage';
import { useToast } from './components/Toasts';
import { AccountError, fetchAccount, hasAccount } from './lib/account-api';
import { communityLocked } from './lib/community';
import { googleConfig, NEEDS_GOOGLE_EVENT, type GoogleConfig } from './lib/google';
import { importProfileFromHash, saveUser, useUser } from './lib/identity';
import { sectionAt, usePath } from './lib/router';

export function App() {
  const path = usePath();
  const [user, setUser] = useUser();
  const toast = useToast();
  // null while asking the server whether this browser can use the app yet.
  const [locked, setLocked] = useState<boolean | null>(null);
  // Google sign-in: whether colleagues can get in with it, and whether it is the only way in.
  const [google, setGoogle] = useState<GoogleConfig | null>(null);
  // With Google as the only way in: this browser's account was made with a password (or no longer
  // exists), so it goes through Google first.
  const [needsGoogle, setNeedsGoogle] = useState(false);

  useEffect(() => {
    void Promise.all([communityLocked(), googleConfig()]).then(([needsCode, config]) => {
      setGoogle(config);
      setLocked(needsCode);
    });
  }, []);

  const onlyGoogle = !!google?.only;
  const signedIn = hasAccount(user) ? user : null;
  useEffect(() => {
    setNeedsGoogle(false);
    if (!onlyGoogle || !signedIn || locked !== false) return;
    let alive = true;
    fetchAccount(signedIn).then(
      (a) => alive && setNeedsGoogle(!a.google),
      (err) => alive && setNeedsGoogle(err instanceof AccountError && err.code === 'unauthorized'),
    );
    return () => {
      alive = false;
    };
    // Only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyGoogle, signedIn?.account, signedIn?.secret, locked]);

  // A room refused this browser's profile ("login_required"): to Google.
  useEffect(() => {
    const show = () => setNeedsGoogle(true);
    window.addEventListener(NEEDS_GOOGLE_EVENT, show);
    return () => window.removeEventListener(NEEDS_GOOGLE_EVENT, show);
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
  // With Google as the only way in, an account is needed too (also after signing out).
  if (locked || (onlyGoogle && (!signedIn || needsGoogle))) {
    return (
      <CommunityGate
        google={google}
        onUnlocked={() => {
          setLocked(false);
          setNeedsGoogle(false);
        }}
      />
    );
  }

  const room = path.match(/^\/r\/([a-z0-9]{6,16})\/?$/i);
  if (room) return <RoomPage key={room[1]} roomId={room[1].toLowerCase()} user={user} setUser={setUser} />;
  if (/^\/salas\/?$/.test(path)) return <Home user={user} setUser={setUser} />;
  if (/^\/admin\/?$/.test(path)) return <AdminPage user={user} setUser={setUser} />;
  const section = sectionAt(path);
  return <RoomPage key={section.id} roomId={section.id} user={user} setUser={setUser} />;
}
