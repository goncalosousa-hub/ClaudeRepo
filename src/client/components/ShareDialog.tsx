import { useMemo, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { encode } from 'uqr';
import { copyText } from '../lib/clipboard';
import { roomUrl } from '../lib/router';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Button, Modal, ModalHeader, inputClass } from './ui';

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
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="rounded-lg bg-white">
      <path d={path} fill="#0a0a12" />
    </svg>
  );
}

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room } = useRoom();
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const url = roomUrl(room.id);

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else toast('Não foi possível copiar. Seleciona o link e copia à mão.', 'error');
  };

  return (
    <Modal open={open} onClose={onClose} label="Convidar colegas">
      <ModalHeader title="Convidar colegas" subtitle="Quem abrir o link entra logo na sala. Não é preciso conta." onClose={onClose} />
      <div className="space-y-4 px-5 py-5">
        <div className="flex gap-2">
          <input className={inputClass} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link da sala" />
          <Button variant="primary" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
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
      </div>
    </Modal>
  );
}
