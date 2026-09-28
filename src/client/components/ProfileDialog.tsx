import { useEffect, useState } from 'react';
import { Check, Copy, Smartphone } from 'lucide-react';
import { AVATARS, LIMITS, MEMBER_COLORS } from '../../shared/constants';
import { newUser, profileLink, randomAvatar, randomColor, type LocalUser } from '../lib/identity';
import { usePrefs } from '../lib/prefs';
import { copyText } from '../lib/clipboard';
import { Avatar, Button, Modal, ModalHeader, Segmented, cn, inputClass } from './ui';
import { useToast } from './Toasts';

export function ProfileDialog({
  open,
  user,
  onSave,
  onClose,
  required = false,
}: {
  open: boolean;
  user: LocalUser | null;
  onSave: (u: LocalUser) => void;
  onClose?: () => void;
  required?: boolean;
}) {
  const [name, setName] = useState(user?.name ?? '');
  const [color, setColor] = useState(user?.color ?? randomColor());
  const [avatar, setAvatar] = useState(user?.avatar ?? randomAvatar());
  const [showTransfer, setShowTransfer] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prefs, setPrefs] = usePrefs();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setColor(user?.color ?? randomColor());
    setAvatar(user?.avatar ?? randomAvatar());
    setShowTransfer(false);
  }, [open, user]);

  const trimmed = name.trim();
  const close = () => {
    if (!required) onClose?.();
  };
  const save = () => {
    if (!trimmed) return;
    onSave(user ? { ...user, name: trimmed, color, avatar } : newUser(trimmed, color, avatar));
    onClose?.();
  };

  return (
    <Modal open={open} onClose={close} label="Perfil">
      <ModalHeader
        title={user ? 'O teu perfil' : 'Como te chamas?'}
        subtitle={user ? 'É assim que os teus colegas te veem.' : 'Não é preciso conta: escolhe só um nome e uma cor.'}
        onClose={required ? undefined : close}
      />
      <form
        className="space-y-5 px-5 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center gap-4">
          <Avatar member={{ name: trimmed || '?', color, avatar }} size={56} />
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="profile-name">
              Nome
            </label>
            <input
              id="profile-name"
              autoFocus
              className={inputClass}
              value={name}
              maxLength={LIMITS.memberName}
              placeholder="Ex.: Gonçalo"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Cor</p>
          <div className="flex flex-wrap gap-2">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn('h-8 w-8 rounded-full transition', color === c ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-surface' : 'hover:scale-105')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Avatar</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setAvatar('')}
              className={cn(
                'flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold',
                avatar === '' ? 'border-accent bg-accent/15' : 'border-line hover:border-line-2',
              )}
            >
              Aa
            </button>
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg border text-lg',
                  avatar === a ? 'border-accent bg-accent/15' : 'border-line hover:border-line-2',
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Títulos dos animes</p>
          <Segmented
            size="sm"
            value={prefs.titles}
            onChange={(titles) => setPrefs({ titles })}
            options={[
              { value: 'romaji', label: 'Japonês (romaji)' },
              { value: 'english', label: 'Inglês' },
            ]}
          />
        </div>

        {user && (
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm font-medium"
              onClick={() => setShowTransfer((v) => !v)}
            >
              <Smartphone size={16} className="text-accent" />
              Usar este perfil noutro dispositivo
            </button>
            {showTransfer && (
              <div className="mt-2 space-y-2 text-xs text-muted">
                <p>
                  Abre este link no telemóvel ou noutro computador para seres a mesma pessoa lá. Não o partilhes com
                  ninguém: quem o tiver pode falar em teu nome.
                </p>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={async () => {
                    if (await copyText(profileLink(user))) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } else {
                      toast('Não foi possível copiar o link.', 'error');
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado!' : 'Copiar link do perfil'}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {!required && (
            <Button variant="ghost" onClick={close}>
              Cancelar
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!trimmed}>
            {user ? 'Guardar' : 'Continuar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
