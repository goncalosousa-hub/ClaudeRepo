import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Check, Copy, KeyRound, LogOut, Smartphone, TriangleAlert } from 'lucide-react';
import { COMPANY } from '../../shared/brand';
import { AVATARS, LIMITS, MEMBER_COLORS, PASSWORD_MIN, isValidUsername } from '../../shared/constants';
import {
  AccountError,
  changePassword,
  fetchAccount,
  googleSignIn,
  hasAccount,
  linkGoogle,
  login,
  register,
  saveProfile,
} from '../lib/account-api';
import { domainsText, forgetGoogleChoice, googleConfig, type GoogleConfig } from '../lib/google';
import { clearUser, newUser, profileLink, randomAvatar, randomColor, type LocalUser } from '../lib/identity';
import { usePrefs } from '../lib/prefs';
import { copyText } from '../lib/clipboard';
import { clearRecentRooms, recentRooms } from '../lib/recent-rooms';
import { GoogleButton } from './GoogleButton';
import { PRIVACY_PATH } from './PrivacyPage';
import { Avatar, Button, Divider, Modal, ModalHeader, Segmented, Spinner, cn, inputClass } from './ui';
import { useToast } from './Toasts';

export type ProfileDialogMode = 'profile' | 'login';

/** Turns what people type into a valid username where possible ("Gonçalo " → "goncalo"). */
export function cleanUsername(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Algo correu mal. Tenta outra vez.');
const labelClass = 'mb-1.5 block text-xs font-medium text-muted';

export function ProfileDialog({
  open,
  user,
  onSave,
  onClose,
  required = false,
  welcome,
  initialMode = 'profile',
  focusAccount = false,
}: {
  open: boolean;
  user: LocalUser | null;
  onSave: (u: LocalUser) => void;
  onClose?: () => void;
  required?: boolean;
  /** A few words shown to someone who has no profile yet (e.g. what the community space is) */
  welcome?: string;
  /** Open on the sign-in form instead of the profile. */
  initialMode?: ProfileDialogMode;
  /** Start in the "create an account" fields (for people who already have a profile). */
  focusAccount?: boolean;
}) {
  const [mode, setMode] = useState<ProfileDialogMode>(initialMode);
  const [name, setName] = useState(user?.name ?? '');
  const [unit, setUnit] = useState(user?.unit ?? '');
  const [color, setColor] = useState(user?.color ?? randomColor());
  const [avatar, setAvatar] = useState(user?.avatar ?? randomAvatar());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleConfig | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [prefs, setPrefs] = usePrefs();
  const toast = useToast();

  useEffect(() => {
    if (open) void googleConfig().then(setGoogle);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode(hasAccount(user) ? 'profile' : initialMode);
    setName(user?.name ?? '');
    setUnit(user?.unit ?? '');
    setColor(user?.color ?? randomColor());
    setAvatar(user?.avatar ?? randomAvatar());
    setUsername('');
    setPassword('');
    setError(null);
    setGoogleError(null);
    setBusy(false);
  }, [open, user, initialMode]);

  const trimmed = name.trim();
  const signedIn = hasAccount(user);
  const wantsAccount = !signedIn && (username !== '' || password !== '');

  const close = () => {
    if (!required) onClose?.();
  };
  const switchMode = (m: ProfileDialogMode) => {
    setMode(m);
    setError(null);
    setGoogleError(null);
    setPassword('');
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const saveProfileOnly = () => {
    if (!user) {
      onSave({ ...newUser(trimmed, color, avatar), unit: unit.trim() });
      onClose?.();
      return;
    }
    const next = { ...user, name: trimmed, color, avatar, unit: unit.trim() };
    onSave(next);
    if (hasAccount(next)) {
      saveProfile(next).catch((err) =>
        toast(`O perfil ficou guardado neste dispositivo, mas não na conta. ${errorText(err)}`, 'error'),
      );
    }
    onClose?.();
  };

  // A new account keeps the profile this device already uses (same member in the same rooms).
  const createAccount = () =>
    run(async () => {
      const u = cleanUsername(username);
      if (!isValidUsername(u)) throw new AccountError('invalid_username');
      if (password.length < PASSWORD_MIN) throw new AccountError('invalid_password');
      const profile = { name: trimmed, color, avatar, unit: unit.trim() };
      const res = await register(u, password, profile, user ? { user, rooms: recentRooms() } : undefined);
      onSave(res.user);
      toast(`Conta @${res.username} criada! Entra com ela em qualquer link ou dispositivo.`, 'success');
      onClose?.();
    });

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || busy) return;
    if (wantsAccount) void createAccount();
    else saveProfileOnly();
  };

  // Signs in to the Google account's account, or creates it: then it keeps the profile this device
  // already uses (or the one typed here; without a name, the name comes from Google).
  const signInWithGoogle = async (credential: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setGoogleError(null);
    try {
      const profile = { name: trimmed, color, avatar, unit: unit.trim() };
      const current = user && !hasAccount(user) ? { user, rooms: recentRooms() } : undefined;
      const res = await googleSignIn(credential, profile, current);
      onSave(res.user);
      toast(
        res.created
          ? `Olá, ${res.user.name}! Ficaste com conta: da próxima vez é só «Continuar com Google».`
          : `Olá, ${res.user.name}! Entraste com a Google.`,
        'success',
      );
      onClose?.();
    } catch (err) {
      setGoogleError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const googleProps = { busy, error: googleError, onCredential: (c: string) => void signInWithGoogle(c) };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void run(async () => {
      const u = cleanUsername(username);
      if (!u || !password) throw new Error('Escreve o teu utilizador e a palavra-passe.');
      const res = await login(u, password);
      onSave(res.user);
      toast(`Olá, ${res.user.name}! Entraste como @${res.username}.`, 'success');
      onClose?.();
    });
  };

  const signOut = () => {
    forgetGoogleChoice();
    clearUser();
    // The rooms are kept in the account; nothing of this person stays on a shared computer.
    clearRecentRooms();
    toast('Sessão terminada neste dispositivo.', 'success');
    onClose?.();
  };

  const title = mode === 'login' ? 'Entrar na tua conta' : user ? 'O teu perfil' : 'Como te chamas?';
  const subtitle =
    mode === 'login'
      ? 'O teu perfil e as tuas salas, em qualquer link ou dispositivo.'
      : user
        ? 'É assim que os teus colegas te veem.'
        : 'Escolhe um nome e uma cor. Com conta, és sempre tu em qualquer link ou dispositivo.';

  return (
    <Modal open={open} onClose={close} label="Perfil">
      <ModalHeader title={title} subtitle={subtitle} onClose={required ? undefined : close} />

      {!user && welcome && (
        <p className="mx-5 mt-4 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm text-fg">{welcome}</p>
      )}

      {!user && (
        <div className="px-5 pt-4">
          <Segmented
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'profile', label: 'Sou novo aqui' },
              { value: 'login', label: 'Já tenho conta' },
            ]}
          />
        </div>
      )}

      {mode === 'login' ? (
        <form className="space-y-4 px-5 py-5" onSubmit={submitLogin}>
          {user && (
            <p className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">
              <TriangleAlert size={16} className="shrink-0 text-warn" />
              <span>
                Ao entrares, este dispositivo passa a usar o perfil da conta em vez de «{user.name}». Se já usaste
                «{user.name}» em salas, volta atrás e cria antes uma conta com ele.
              </span>
            </p>
          )}
          {google && (
            <>
              <GoogleSignIn config={google} {...googleProps} />
              <Divider>ou com utilizador e palavra-passe</Divider>
            </>
          )}
          <AccountFields
            username={username}
            password={password}
            onUsername={setUsername}
            onPassword={setPassword}
            autoFocus={!google}
            newPassword={false}
          />
          {error && <ErrorText text={error} />}
          <div className="flex justify-end gap-2 pt-1">
            {user && (
              <Button variant="ghost" onClick={() => switchMode('profile')}>
                Voltar
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy && <Spinner size={16} />} Entrar
            </Button>
          </div>
        </form>
      ) : (
        <>
          {signedIn && <AccountCard user={user} google={google} onSignOut={signOut} />}
          <form className="space-y-5 px-5 py-5" onSubmit={submitProfile}>
            {google && !user && (
              <>
                <GoogleSignIn config={google} {...googleProps} />
                <Divider>ou escolhe tu um nome</Divider>
              </>
            )}
            <div className="flex items-center gap-4">
              <Avatar member={{ name: trimmed || '?', color, avatar }} size={56} />
              <div className="flex-1">
                <label className={labelClass} htmlFor="profile-name">
                  Nome
                </label>
                <input
                  id="profile-name"
                  autoFocus={!focusAccount}
                  className={inputClass}
                  value={name}
                  maxLength={LIMITS.memberName}
                  placeholder="Ex.: Gonçalo"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="profile-unit">
                Empresa ou unidade <span className="font-normal text-faint">(opcional)</span>
              </label>
              <input
                id="profile-unit"
                className={inputClass}
                value={unit}
                maxLength={LIMITS.memberUnit}
                placeholder="Ex.: Lusiaves, Marinha das Ondas"
                onChange={(e) => setUnit(e.target.value)}
              />
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
                    className={cn(
                      'h-8 w-8 rounded-full transition',
                      color === c ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'hover:scale-105',
                    )}
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

            {!signedIn && (
              <div className={cn('rounded-xl border p-3.5', focusAccount ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface-2')}>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound size={16} className="text-accent" />
                  {user ? 'Guardar este perfil numa conta' : 'Criar conta'}
                  <span className="text-xs font-normal text-faint">(recomendado)</span>
                </p>
                <p className="mt-1 mb-3 text-xs text-muted">
                  Com utilizador e palavra-passe entras com {user ? 'este perfil' : 'o teu perfil'} em qualquer link ou
                  dispositivo e ficas com a lista das tuas salas.{!user && ' Deixa em branco para continuar sem conta.'}
                </p>
                {google && user && (
                  <div className="mb-3 space-y-3">
                    <GoogleSignIn config={google} {...googleProps} hint={false} />
                    <Divider>ou com utilizador e palavra-passe</Divider>
                  </div>
                )}
                <AccountFields
                  username={username}
                  password={password}
                  onUsername={setUsername}
                  onPassword={setPassword}
                  autoFocus={focusAccount}
                />
                {user && (
                  <button
                    type="button"
                    className="mt-3 text-xs text-muted underline underline-offset-2 hover:text-fg"
                    onClick={() => switchMode('login')}
                  >
                    Já tens conta? Entrar
                  </button>
                )}
              </div>
            )}

            {user && !signedIn && <TransferLink user={user} />}

            {error && <ErrorText text={error} />}
            <div className="flex justify-end gap-2 pt-1">
              {!required && (
                <Button variant="ghost" onClick={close}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" variant="primary" disabled={!trimmed || busy}>
                {busy && <Spinner size={16} />}
                {wantsAccount
                  ? user
                    ? 'Criar conta e guardar'
                    : 'Criar conta e continuar'
                  : user
                    ? 'Guardar'
                    : 'Continuar sem conta'}
              </Button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-bad">
      {text}
    </p>
  );
}

/** "Continuar com Google" and what it does. */
function GoogleSignIn({
  config,
  busy,
  error,
  onCredential,
  hint = true,
}: {
  config: GoogleConfig;
  busy: boolean;
  error: string | null;
  onCredential: (credential: string) => void;
  hint?: boolean;
}) {
  return (
    <div className="space-y-2">
      <GoogleButton config={config} onCredential={onCredential} />
      {error && <ErrorText text={error} />}
      {busy ? (
        <p className="flex items-center justify-center gap-2 text-xs text-muted">
          <Spinner size={14} /> A entrar…
        </p>
      ) : (
        hint && (
          <p className="text-center text-xs text-muted">
            {config.domains.length
              ? `Com o email da ${COMPANY} (${domainsText(config.domains)}): és sempre tu, em qualquer dispositivo, sem mais uma palavra-passe.`
              : 'Com a tua conta Google: és sempre tu, em qualquer dispositivo, sem mais uma palavra-passe.'}{' '}
            <a className="underline underline-offset-2 hover:text-fg" href={PRIVACY_PATH} target="_blank" rel="noreferrer">
              Privacidade
            </a>
          </p>
        )
      )}
    </div>
  );
}

function AccountFields({
  username,
  password,
  onUsername,
  onPassword,
  autoFocus = false,
  newPassword = true,
}: {
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  autoFocus?: boolean;
  newPassword?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor="account-username">
          Utilizador
        </label>
        <input
          id="account-username"
          className={inputClass}
          autoFocus={autoFocus}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={24}
          placeholder="ex.: goncalo"
          value={username}
          onChange={(e) => onUsername(cleanUsername(e.target.value))}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="account-password">
          Palavra-passe
        </label>
        <input
          id="account-password"
          type="password"
          className={inputClass}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          maxLength={128}
          placeholder={newPassword ? `mínimo ${PASSWORD_MIN} caracteres` : undefined}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
      </div>
    </div>
  );
}

/** Signed-in account: username, how it signs in (password, Google), password change and sign out. */
function AccountCard({
  user,
  google,
  onSignOut,
}: {
  user: LocalUser & { account: string };
  google: GoogleConfig | null;
  onSignOut: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ google: string | null; password: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    fetchAccount(user).then(
      (a) => alive && setInfo({ google: a.google, password: a.password }),
      () => {},
    );
    return () => {
      alive = false;
    };
    // Only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.account, user.secret]);

  const link = async (credential: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await linkGoogle(user, credential);
      setInfo((i) => ({ password: i?.password ?? true, google: res.google }));
      setLinking(false);
      toast('Conta Google ligada: da próxima vez podes entrar com «Continuar com Google».', 'success');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const change = async () => {
    if (busy) return;
    if (next.length < PASSWORD_MIN) return setError(new AccountError('invalid_password').message);
    setBusy(true);
    setError(null);
    try {
      await changePassword(user, current, next);
      toast('Palavra-passe alterada.', 'success');
      setChanging(false);
      setCurrent('');
      setNext('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  // Enter in these fields changes the password (they are outside the profile form on purpose).
  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void change();
    }
  };

  return (
    <div className="mx-5 mt-5 rounded-xl border border-line bg-surface-2 p-3.5">
      <p className="flex items-center gap-2 text-sm">
        <KeyRound size={16} className="shrink-0 text-accent" />
        <span className="min-w-0 truncate">
          Conta <span className="font-semibold">@{user.account}</span>
        </span>
      </p>
      <p className="mt-1 text-xs text-muted">
        {info?.google
          ? info.password
            ? `Entra com este utilizador ou com a Google (${info.google}) em qualquer link ou dispositivo para seres sempre tu.`
            : `Entra com «Continuar com Google» (${info.google}) em qualquer link ou dispositivo para seres sempre tu.`
          : 'Entra com este utilizador em qualquer link ou dispositivo para seres sempre tu.'}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {info?.password && (
          <Button size="xs" variant="subtle" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
            Mudar palavra-passe
          </Button>
        )}
        {google && info && !info.google && (
          <Button size="xs" variant="subtle" aria-expanded={linking} onClick={() => setLinking((v) => !v)}>
            Ligar à conta Google
          </Button>
        )}
        <Button size="xs" variant="subtle" onClick={onSignOut}>
          <LogOut size={13} /> Terminar sessão
        </Button>
      </div>
      {linking && google && (
        <div className="mt-3 space-y-2">
          <GoogleButton config={google} onCredential={(credential) => void link(credential)} />
          <p className="text-center text-xs text-muted">
            {busy
              ? 'A ligar…'
              : `Escolhe a tua conta Google${google.domains.length ? ` (${domainsText(google.domains)})` : ''}. Depois entras com ela ou com a palavra-passe.`}
          </p>
          {error && <ErrorText text={error} />}
        </div>
      )}
      {changing && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="password-current">
                Palavra-passe atual
              </label>
              <input
                id="password-current"
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="password-next">
                Nova palavra-passe
              </label>
              <input
                id="password-next"
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                onKeyDown={onEnter}
              />
            </div>
          </div>
          {error && <ErrorText text={error} />}
          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={busy || !current || !next} onClick={() => void change()}>
              {busy && <Spinner size={14} />} Guardar palavra-passe
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** For profiles without account: a private link that opens the same profile on another device. */
function TransferLink({ user }: { user: LocalUser }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <Smartphone size={16} className="text-accent" />
        Usar este perfil noutro dispositivo sem conta
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-xs text-muted">
          <p>
            Abre este link no telemóvel ou noutro computador para seres a mesma pessoa lá (só funciona neste endereço do
            site). Não o partilhes com ninguém: quem o tiver pode falar em teu nome.
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
  );
}
