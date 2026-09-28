// Accounts: a username + password that gives back the same profile (and the list of rooms) on any
// link or device. The browser proves who it is with the profile's secret.
import { ROOM_ID_RE } from '../../shared/constants';
import type { LocalUser } from './identity';

export interface AccountRoom {
  id: string;
  name: string;
  visitedAt: number;
}

export interface LoginResult {
  username: string;
  user: LocalUser & { account: string };
  rooms: AccountRoom[];
}

export interface AccountInfo {
  username: string;
  profile: { name: string; color: string; avatar: string; unit?: string };
  rooms: AccountRoom[];
}

type Profile = Pick<LocalUser, 'name' | 'color' | 'avatar' | 'unit'>;
type SignedIn = LocalUser & { account: string };

const MESSAGES: Record<string, string> = {
  username_taken: 'Esse nome de utilizador já existe. Escolhe outro (ou entra, se a conta for tua).',
  invalid_username: 'O utilizador deve ter 3 a 24 caracteres: letras minúsculas, números, ponto, hífen ou _.',
  invalid_password: 'A palavra-passe tem de ter pelo menos 6 caracteres.',
  invalid_credentials: 'Utilizador ou palavra-passe errados.',
  wrong_password: 'A palavra-passe atual está errada.',
  rate_limited: 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.',
  unauthorized: 'A sessão desta conta já não é válida. Entra outra vez.',
  network: 'Sem ligação ao servidor. Verifica a internet.',
  invalid_request: 'Pedido inválido.',
  server_error: 'Erro no servidor. Tenta outra vez.',
};

export class AccountError extends Error {
  constructor(readonly code: string) {
    super(MESSAGES[code] ?? `Erro: ${code}`);
  }
}

async function request<T>(method: string, url: string, body?: unknown, user?: SignedIn): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (user) headers.Authorization = `Account ${user.account}:${user.secret}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new AccountError('network');
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new AccountError(data?.error ?? (res.status >= 500 ? 'server_error' : 'invalid_request'));
  return data as T;
}

export const hasAccount = (u: LocalUser | null): u is SignedIn => !!u?.account;

/**
 * Creates an account. With `current` (the profile this browser already uses), the account keeps it,
 * so the person stays the same member in the rooms they were already in (listed in `rooms`).
 */
export function register(
  username: string,
  password: string,
  profile: Profile,
  current?: { user: LocalUser; rooms: { id: string; visitedAt: number }[] },
) {
  const rooms = current?.rooms
    .filter((r) => ROOM_ID_RE.test(r.id) && Number.isInteger(r.visitedAt) && r.visitedAt >= 0)
    .slice(0, 50);
  const identity = current ? { id: current.user.id, secret: current.user.secret, rooms } : {};
  return request<LoginResult>('POST', '/api/auth/register', { username, password, ...profile, ...identity });
}

export function login(username: string, password: string) {
  return request<LoginResult>('POST', '/api/auth/login', { username, password });
}

export function fetchAccount(user: SignedIn) {
  return request<AccountInfo>('GET', '/api/account', undefined, user);
}

export function saveProfile(user: SignedIn) {
  const { name, color, avatar, unit = '' } = user;
  return request<{ ok: true }>('PATCH', '/api/account', { name, color, avatar, unit }, user);
}

export function changePassword(user: SignedIn, current: string, next: string) {
  return request<{ ok: true }>('POST', '/api/account/password', { current, next }, user);
}

export function forgetAccountRoom(user: SignedIn, roomId: string) {
  return request<{ ok: true }>('DELETE', `/api/account/rooms/${roomId}`, undefined, user);
}
