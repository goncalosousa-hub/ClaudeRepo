import { useEffect, useRef, useState } from 'react';
import { loadGis, type GoogleConfig } from '../lib/google';
import { cn } from './ui';

/**
 * Google's own "Continuar com Google" button. After the person picks their account in Google's
 * window, `onCredential` gets the ID token to send to the server. Show one at a time: Google keeps
 * a single callback for the page.
 */
export function GoogleButton({
  config,
  onCredential,
  className,
}: {
  config: GoogleConfig;
  onCredential: (credential: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    callback.current = onCredential;
  });

  useEffect(() => {
    let alive = true;
    loadGis().then(
      (gis) => {
        const el = ref.current;
        if (!alive || !el) return;
        gis.initialize({
          client_id: config.clientId,
          callback: (res) => {
            if (res.credential) callback.current(res.credential);
          },
          // Google's account list shows only the company's accounts (the server checks it anyway).
          hd: config.domains.length === 1 ? config.domains[0] : undefined,
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
          itp_support: true,
        });
        gis.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.round(Math.min(400, Math.max(200, el.clientWidth))),
          locale: 'pt-PT',
        });
        setState('ready');
      },
      () => {
        if (alive) setState('failed');
      },
    );
    return () => {
      alive = false;
    };
  }, [config, attempt]);

  return (
    <div className={cn('relative w-full', className)}>
      <div ref={ref} className={cn('flex min-h-10 w-full justify-center', state === 'failed' && 'hidden')} />
      {state === 'loading' && <div className="absolute inset-x-0 top-0 h-10 animate-pulse rounded-full bg-fg/5" aria-hidden />}
      {state === 'failed' && (
        <p className="text-center text-xs text-muted">
          O botão da Google não abriu (sem internet, ou bloqueado por uma extensão).{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-fg"
            onClick={() => {
              setState('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Tentar outra vez
          </button>
        </p>
      )}
    </div>
  );
}
