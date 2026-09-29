import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { COMMUNITY, COMPANY } from '../../shared/brand';
import { googleSignIn } from '../lib/account-api';
import { unlockCommunity } from '../lib/community';
import { domainsText, type GoogleConfig } from '../lib/google';
import { loadUser, saveUser } from '../lib/identity';
import { recentRooms } from '../lib/recent-rooms';
import { GoogleButton } from './GoogleButton';
import { Logo } from './Logo';
import { useToast } from './Toasts';
import { Button, Divider, Spinner, inputClass } from './ui';

const MESSAGES = {
  wrong: 'Código errado. Confirma-o com quem to deu.',
  rate_limited: 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.',
  network: 'Sem ligação ao servidor. Verifica a internet.',
};

/**
 * Asks for the community code (or a Google account of the company): the app is only for colleagues.
 * `google`: the server's Google sign-in settings, if on.
 */
export function CommunityGate({ google, onUnlocked }: { google: GoogleConfig | null; onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const toast = useToast();
  // Only a Google account of the company (GOOGLE_DOMAIN) opens the app.
  const withGoogle = google?.domains.length ? google : null;

  // Signing in with the work email's Google account opens the app and signs in at once. A profile this
  // browser already used (without an account) stays the same in a new account.
  const signInWithGoogle = async (credential: string) => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const user = loadUser();
      const guest = user && !user.account ? user : null;
      const res = await googleSignIn(
        credential,
        guest ? { name: guest.name, color: guest.color, avatar: guest.avatar, unit: guest.unit ?? '' } : undefined,
        guest ? { user: guest, rooms: recentRooms() } : undefined,
      );
      saveUser(res.user);
      toast(`Olá, ${res.user.name}! Bem-vindo.`, 'success');
      onUnlocked();
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Algo correu mal. Tenta outra vez.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await unlockCommunity(code);
    setBusy(false);
    if (result === 'ok') onUnlocked();
    else setError(MESSAGES[result]);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <LockKeyhole size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Só para colaboradores</h1>
            <p className="text-sm text-muted">Um espaço dos colaboradores do {COMMUNITY}.</p>
          </div>
        </div>
        {withGoogle && (
          <>
            <div className="space-y-2">
              <GoogleButton config={withGoogle} onCredential={(c) => void signInWithGoogle(c)} />
              {googleError ? (
                <p role="alert" className="text-sm text-bad">
                  {googleError}
                </p>
              ) : (
                <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
                  {googleBusy && <Spinner size={14} />}
                  {googleBusy ? 'A entrar…' : `Com o email da ${COMPANY} (${domainsText(withGoogle.domains)}).`}
                </p>
              )}
            </div>
            <Divider>ou com o código</Divider>
          </>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="community-code">
            Código da comunidade
          </label>
          <input
            id="community-code"
            className={inputClass}
            autoFocus={!withGoogle}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-faint">Não o tens? Pede-o a um colega. Só é preciso uma vez em cada dispositivo.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !code.trim()}>
          {busy && <Spinner size={16} />} Entrar
        </Button>
      </form>
    </div>
  );
}
