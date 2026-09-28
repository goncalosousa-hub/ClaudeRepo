import { useState, type FormEvent } from 'react';
import { LockKeyhole } from 'lucide-react';
import { COMMUNITY } from '../../shared/brand';
import { unlockCommunity } from '../lib/community';
import { Logo } from './Logo';
import { Button, Spinner, inputClass } from './ui';

const MESSAGES = {
  wrong: 'Código errado. Confirma-o com quem to deu.',
  rate_limited: 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.',
  network: 'Sem ligação ao servidor. Verifica a internet.',
};

/** Asks for the community code: the app is only for colleagues. */
export function CommunityGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-violet-300">
            <LockKeyhole size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Só para colaboradores</h1>
            <p className="text-sm text-muted">Um espaço dos colaboradores do {COMMUNITY}.</p>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="community-code">
            Código da comunidade
          </label>
          <input
            id="community-code"
            className={inputClass}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-faint">Não o tens? Pede-o a um colega. Só é preciso uma vez em cada dispositivo.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-300">
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
