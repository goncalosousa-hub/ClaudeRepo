import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Share2, TriangleAlert } from 'lucide-react';
import { encode } from 'uqr';
import { copyText } from '../lib/clipboard';
import { roomUrl } from '../lib/router';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Button, Modal, ModalHeader, cn, inputClass } from './ui';

function QrCode({ text, size = 176 }: { text: string; size?: number }) {
  const qr = useMemo(() => encode(text, { ecc: 'M', border: 2 }), [text]);
  const n = qr.size;
  let path = '';
  qr.data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="shrink-0 rounded-lg bg-white">
      <path d={path} fill="#0a0a12" />
    </svg>
  );
}

interface LanUrl {
  url: string;
  iface: string;
  virtual: boolean;
}

/** "localhost" links only work on the host's own computer. */
const onLocalhost = () => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room } = useRoom();
  const [copied, setCopied] = useState(false);
  const [lan, setLan] = useState<LanUrl[] | null>(null);
  const [help, setHelp] = useState(false);
  const toast = useToast();
  const local = onLocalhost();

  useEffect(() => {
    if (!open || !local) return;
    fetch('/api/network')
      .then((r) => r.json() as Promise<{ lan: LanUrl[] }>)
      .then((d) => setLan(d.lan))
      .catch(() => setLan([]));
  }, [open, local]);

  const real = (lan ?? []).filter((a) => !a.virtual);
  const url = local && real.length ? `${real[0].url}/r/${room.id}` : roomUrl(room.id);

  const copy = async (text: string) => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else toast('Não foi possível copiar. Seleciona o link e copia à mão.', 'error');
  };

  return (
    <Modal open={open} onClose={onClose} label="Convidar colegas">
      <ModalHeader title="Convidar colegas" subtitle="Quem abrir o link entra logo na sala. Não é preciso conta." onClose={onClose} />
      <div className="space-y-4 px-5 py-5">
        {local && (
          <div className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-amber-100">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
            <div className="space-y-1">
              <p>
                Abriste a app em <b>localhost</b>, que só funciona neste computador.
                {real.length > 0
                  ? ' O link abaixo usa o endereço da tua rede: funciona para colegas ligados à mesma rede Wi-Fi.'
                  : lan
                    ? ' Não encontrei nenhum endereço de rede: liga-te a uma rede Wi-Fi ou usa um túnel (ver dicas).'
                    : ''}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input className={inputClass} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link da sala" />
          <Button variant="primary" onClick={() => copy(url)}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        {local && real.length > 1 && (
          <p className="text-xs text-muted">
            Outros endereços deste computador:{' '}
            {real.slice(1).map((a) => (
              <button key={a.url} className="mr-2 font-mono text-fg underline" onClick={() => copy(`${a.url}/r/${room.id}`)} title={a.iface}>
                {a.url.replace('http://', '')}
              </button>
            ))}
          </p>
        )}

        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:flex-row sm:items-start">
          <QrCode text={url} />
          <div className="space-y-2 text-sm text-muted">
            <p>
              <span className="font-medium text-fg">Estão juntos?</span> Mostra este QR code e cada um aponta a câmara do
              telemóvel.
            </p>
            <p>
              Código da sala: <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-fg">{room.id}</span>
            </p>
            {typeof navigator.share === 'function' && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() => navigator.share({ title: room.name, text: `Junta-te à tierlist "${room.name}"`, url }).catch(() => {})}
              >
                <Share2 size={14} /> Partilhar…
              </Button>
            )}
          </div>
        </div>

        {local && (
          <div className="rounded-xl border border-line">
            <button className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium" onClick={() => setHelp((v) => !v)}>
              Os colegas não conseguem entrar?
              <ChevronDown size={16} className={cn('transition', help && 'rotate-180')} />
            </button>
            {help && (
              <ol className="list-decimal space-y-2 border-t border-line py-3 pr-3 pl-8 text-xs leading-relaxed text-muted">
                <li>
                  Têm de estar <b className="text-fg">na mesma rede Wi-Fi</b> que este computador. Experimenta primeiro no teu
                  telemóvel.
                </li>
                <li>
                  A <b className="text-fg">firewall do Windows</b> pode estar a bloquear. Abre o PowerShell como administrador e
                  corre:
                  <code className="mt-1 block rounded bg-surface-3 p-2 font-mono text-[11px] break-all text-fg select-all">
                    New-NetFirewallRule -DisplayName "Anime Tierlist" -Direction Inbound -Protocol TCP -LocalPort{' '}
                    {location.port || 80} -Action Allow
                  </code>
                </li>
                <li>
                  Redes de escolas/universidades (ex.: eduroam) costumam bloquear ligações entre computadores. Nesse caso — ou se
                  os colegas estiverem noutro sítio — cria um <b className="text-fg">túnel</b> (grátis, sem conta):
                  <code className="mt-1 block rounded bg-surface-3 p-2 font-mono text-[11px] text-fg select-all">
                    cloudflared tunnel --url http://localhost:{location.port || 80}
                  </code>
                  e envia o link <span className="font-mono">https://….trycloudflare.com</span> que aparece. (Instala com{' '}
                  <span className="font-mono text-fg">winget install Cloudflare.cloudflared</span>.)
                </li>
              </ol>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
