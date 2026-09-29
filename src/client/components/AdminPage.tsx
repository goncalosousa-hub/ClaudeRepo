import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, DoorOpen, ExternalLink, LayoutDashboard, RefreshCw, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { APP_NAME } from '../../shared/brand';
import { COMMUNITY_SECTIONS } from '../../shared/constants';
import { AccountError, hasAccount } from '../lib/account-api';
import { adminOverview, adminPeople, adminRooms, deletePerson, deleteRoom, type AdminOverview, type AdminPerson, type AdminRoom } from '../lib/admin-api';
import { formatNumber, plural, timeAgo } from '../lib/format';
import type { LocalUser } from '../lib/identity';
import { navigate, roomPath } from '../lib/router';
import { kindInfo } from '../lib/words';
import { Logo } from './Logo';
import { ProfileDialog } from './ProfileDialog';
import { useToast } from './Toasts';
import { Avatar, Button, Chip, Modal, ModalHeader, Segmented, Spinner, cn, inputClass } from './ui';

type Tab = 'overview' | 'people' | 'rooms';
type PeopleFilter = 'all' | 'account' | 'guest' | 'repeated';
type Data = { overview: AdminOverview; people: AdminPerson[]; me: string; rooms: AdminRoom[] };

/** "Gonçalo " and "goncalo" are the same name. */
const sameName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const megabytes = (bytes: number) => `${formatNumber(Math.round((bytes / 1024 / 1024) * 10) / 10)} MB`;

/** The admins' page (/admin): only for the accounts in ADMINS. */
export function AdminPage({ user, setUser }: { user: LocalUser | null; setUser: (u: LocalUser) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const signedIn = hasAccount(user) ? user : null;

  useEffect(() => {
    document.title = `Administração · ${APP_NAME}`;
  }, []);

  const load = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      const [overview, people, rooms] = await Promise.all([adminOverview(signedIn), adminPeople(signedIn), adminRooms(signedIn)]);
      setData({ overview, people: people.people, me: people.me, rooms: rooms.rooms });
      setError(null);
    } catch (err) {
      setError(err instanceof AccountError ? err.code : 'network');
    } finally {
      setLoading(false);
    }
    // Only when the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn?.account, signedIn?.secret]);

  useEffect(() => {
    void load();
  }, [load]);

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <Notice title="Entra com a tua conta de administrador" text="Esta página é só para as contas indicadas em ADMINS.">
        <Button variant="primary" onClick={() => setSignIn(true)}>
          Entrar
        </Button>
      </Notice>
    );
  } else if (error === 'forbidden') {
    body = <Notice title="Só para administradores" text={`A conta @${signedIn.account} não está em ADMINS.`} />;
  } else if (error && !data) {
    body = (
      <Notice title="Não foi possível abrir" text={new AccountError(error).message}>
        <Button onClick={() => void load()}>Tentar outra vez</Button>
      </Notice>
    );
  } else if (!data) {
    body = (
      <div className="flex justify-center py-20 text-muted">
        <Spinner />
      </div>
    );
  } else {
    body = (
      <>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: <TabLabel icon={<LayoutDashboard size={15} />} text="Resumo" /> },
              { value: 'people', label: <TabLabel icon={<Users size={15} />} text={`Pessoas (${data.people.length})`} /> },
              { value: 'rooms', label: <TabLabel icon={<DoorOpen size={15} />} text={`Salas (${data.rooms.length})`} /> },
            ]}
          />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Atualizar
          </Button>
        </div>
        {tab === 'overview' && <OverviewTab overview={data.overview} />}
        {tab === 'people' && <PeopleTab user={signedIn} people={data.people} me={data.me} onChanged={load} />}
        {tab === 'rooms' && <RoomsTab user={signedIn} rooms={data.rooms} onChanged={load} />}
      </>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo compact />
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck size={18} className="text-accent" /> Administração
          </h1>
          {signedIn && <span className="hidden text-xs text-faint sm:inline">@{signedIn.account}</span>}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate('/')}>
            <ArrowLeft size={15} /> Comunidade
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{body}</main>
      <ProfileDialog open={signIn} user={user} initialMode="login" onSave={setUser} onClose={() => setSignIn(false)} />
    </div>
  );
}

function TabLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  );
}

function Notice({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
      <ShieldCheck size={30} className="mx-auto mb-3 text-accent" />
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
      {children && <div className="mt-4 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

// --- Resumo --------------------------------------------------------------------------------------

function OverviewTab({ overview: o }: { overview: AdminOverview }) {
  const total = (field: 'titles' | 'reviews' | 'photos' | 'messages') => o.sections.reduce((n, s) => n + s[field], 0);
  const used = Math.min(1, o.photoBytes / o.config.photosMaxBytes);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Pessoas na comunidade" value={o.people} note={o.online ? `${formatNumber(o.online)} online agora` : 'ninguém online agora'} />
        <Stat label="Contas" value={o.accounts} note={`${formatNumber(o.googleAccounts)} com a Google`} />
        <Stat label="Recomendações" value={total('titles')} note={`${plural(total('reviews'), 'opinião', 'opiniões')}`} />
        <Stat label="Fotos" value={total('photos')} note={`${megabytes(o.photoBytes)} de ${megabytes(o.config.photosMaxBytes)}`}>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fg/5">
            <div className={cn('h-full rounded-full', used > 0.85 ? 'bg-bad' : 'bg-accent')} style={{ width: `${Math.max(2, used * 100)}%` }} />
          </div>
        </Stat>
        <Stat label="Mensagens no chat" value={total('messages')} />
        <Stat label="Salas" value={o.rooms} note="espaços só com quem foi convidado" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Secções da comunidade</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-faint">
              <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                <th>Secção</th>
                <th>Pessoas</th>
                <th>Recomendações</th>
                <th>Opiniões</th>
                <th>Fotos</th>
                <th>Mensagens</th>
                <th>Online</th>
              </tr>
            </thead>
            <tbody>
              {o.sections.map((s) => {
                const section = COMMUNITY_SECTIONS.find((c) => c.id === s.id);
                return (
                  <tr key={s.id} className="border-t border-line [&>td]:px-4 [&>td]:py-2.5">
                    <td className="font-medium whitespace-nowrap">
                      {section?.emoji} {section?.label ?? s.id}
                    </td>
                    <td>{formatNumber(s.members)}</td>
                    <td>{formatNumber(s.titles)}</td>
                    <td>{formatNumber(s.reviews)}</td>
                    <td>{formatNumber(s.photos)}</td>
                    <td>{formatNumber(s.messages)}</td>
                    <td>{formatNumber(s.online)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Configuração</h2>
        <ul className="space-y-2 text-sm">
          <Setting
            on={!!o.config.google}
            name="Entrar com a Google"
            text={
              o.config.google
                ? o.config.google.domains.length
                  ? `Ativo: só contas ${o.config.google.domains.map((d) => `@${d}`).join(', ')}`
                  : 'Ativo: qualquer conta Google (define GOOGLE_DOMAIN)'
                : 'Desligado (falta GOOGLE_CLIENT_ID)'
            }
          />
          <Setting
            on={o.config.communityCode}
            name="Código da comunidade"
            text={o.config.communityCode ? 'Ativo: só entra quem sabe o código (ou tem conta Google do grupo)' : 'Desligado: qualquer pessoa com o link entra'}
          />
          <Setting on={o.config.tmdb} name="Séries e filmes (TMDB)" text={o.config.tmdb ? 'Ativo' : 'Desligado (falta TMDB_API_KEY)'} />
          <Setting on name="Administradores" text={o.config.admins.join(', ')} />
        </ul>
        <p className="mt-3 text-xs text-faint">Estas definições mudam-se nas variáveis de ambiente do servidor (no Render: Environment).</p>
      </section>
    </div>
  );
}

function Stat({ label, value, note, children }: { label: string; value: number; note?: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight">{formatNumber(value)}</p>
      {note && <p className="mt-0.5 text-xs text-faint">{note}</p>}
      {children}
    </div>
  );
}

function Setting({ on, name, text }: { on: boolean; name: string; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', on ? 'bg-ok' : 'bg-faint')} />
      <span>
        <span className="font-medium">{name}:</span> <span className="text-muted">{text}</span>
      </span>
    </li>
  );
}

// --- Pessoas -------------------------------------------------------------------------------------

function PeopleTab({
  user,
  people,
  me,
  onChanged,
}: {
  user: LocalUser & { account: string };
  people: AdminPerson[];
  me: string;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<AdminPerson[] | null>(null);
  const [busy, setBusy] = useState(false);

  const repeated = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of people) counts.set(sameName(p.name), (counts.get(sameName(p.name)) ?? 0) + 1);
    return new Set(people.filter((p) => (counts.get(sameName(p.name)) ?? 0) > 1).map((p) => p.id));
  }, [people]);

  const deletable = (p: AdminPerson) => p.id !== me && !p.account?.admin;

  const shown = useMemo(() => {
    const q = sameName(query);
    const list = people.filter((p) => {
      if (filter === 'account' && !p.account) return false;
      if (filter === 'guest' && p.account) return false;
      if (filter === 'repeated' && !repeated.has(p.id)) return false;
      if (!q) return true;
      return [p.name, p.unit, p.account?.username ?? '', p.account?.google ?? ''].some((text) => sameName(text).includes(q));
    });
    // Repeated names next to each other.
    return filter === 'repeated' ? [...list].sort((a, b) => sameName(a.name).localeCompare(sameName(b.name))) : list;
  }, [people, query, filter, repeated]);

  // People that disappeared (deleted, or filtered away) are no longer selected.
  const selectedPeople = people.filter((p) => selected.has(p.id) && deletable(p));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remove = async (list: AdminPerson[]) => {
    setBusy(true);
    const failed: string[] = [];
    for (const p of list) {
      try {
        await deletePerson(user, p.id);
      } catch (err) {
        failed.push(`${p.name}: ${err instanceof Error ? err.message : 'erro'}`);
      }
    }
    setBusy(false);
    setConfirming(null);
    setSelected(new Set());
    const done = list.length - failed.length;
    if (done) toast(`${plural(done, 'pessoa eliminada', 'pessoas eliminadas')}.`, 'success');
    if (failed.length) toast(`Não foi possível eliminar: ${failed.join('; ')}`, 'error');
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Procurar por nome, empresa, utilizador ou email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Procurar pessoas"
          />
        </label>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'account', label: 'Com conta' },
            { value: 'guest', label: 'Sem conta' },
            { value: 'repeated', label: `Nomes repetidos (${repeated.size})` },
          ]}
        />
      </div>

      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm">
          <span>{plural(selectedPeople.length, 'pessoa selecionada', 'pessoas selecionadas')}</span>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Limpar
          </Button>
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => setConfirming(selectedPeople)}>
            <Trash2 size={14} /> Eliminar selecionadas
          </Button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Ninguém encontrado.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              me={p.id === me}
              repeated={repeated.has(p.id)}
              selected={selected.has(p.id)}
              deletable={deletable(p)}
              onToggle={() => toggle(p.id)}
              onDelete={() => setConfirming([p])}
            />
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmPeople people={confirming} busy={busy} onCancel={() => !busy && setConfirming(null)} onConfirm={() => void remove(confirming)} />
      )}
    </div>
  );
}

function PersonRow({
  person: p,
  me,
  repeated,
  selected,
  deletable,
  onToggle,
  onDelete,
}: {
  person: AdminPerson;
  me: boolean;
  repeated: boolean;
  selected: boolean;
  deletable: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const activity = [
    p.titles && plural(p.titles, 'recomendação', 'recomendações'),
    p.reviews && plural(p.reviews, 'opinião', 'opiniões'),
    p.photos && plural(p.photos, 'foto', 'fotos'),
    p.messages && plural(p.messages, 'mensagem', 'mensagens'),
  ].filter(Boolean);
  const why = me ? 'És tu' : p.account?.admin ? 'É administrador (está em ADMINS)' : undefined;
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', selected && 'bg-bad/5')} data-person={p.id}>
      <input
        type="checkbox"
        className="mt-3 h-4 w-4 accent-[var(--color-accent)]"
        checked={selected && deletable}
        disabled={!deletable}
        title={why}
        onChange={onToggle}
        aria-label={`Selecionar ${p.name}`}
      />
      <Avatar member={p} size={40} online={p.online} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{p.name}</span>
          {me && <Chip className="bg-accent/10 text-accent">Tu</Chip>}
          {p.account?.admin && <Chip className="bg-accent/10 text-accent">Admin</Chip>}
          {p.online && <Chip color="#15803d">Online</Chip>}
          {repeated && <Chip color="#b45309">Nome repetido</Chip>}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {[p.unit, p.account ? `@${p.account.username}` : 'Sem conta', p.account?.google].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
          <span className="flex gap-0.5" title="Secções da comunidade onde entrou">
            {COMMUNITY_SECTIONS.map((s) => (
              <span key={s.id} className={cn(!p.sections.includes(s.id) && 'opacity-25 grayscale')} aria-label={s.label}>
                {s.emoji}
              </span>
            ))}
          </span>
          <span>{activity.length ? activity.join(' · ') : 'sem atividade'}</span>
          <span>
            {p.online
              ? 'online agora'
              : p.lastSeen
                ? `visto ${timeAgo(p.lastSeen)}`
                : p.joinedAt
                  ? `entrou ${timeAgo(p.joinedAt)}`
                  : p.account
                    ? `conta criada ${timeAgo(p.account.createdAt)}`
                    : ''}
          </span>
        </p>
      </div>
      <Button size="sm" variant="ghost" className="text-bad hover:bg-bad/10" onClick={onDelete} disabled={!deletable} title={why} aria-label={`Eliminar ${p.name}`}>
        <Trash2 size={15} /> <span className="hidden sm:inline">Eliminar</span>
      </Button>
    </li>
  );
}

function ConfirmPeople({ people, busy, onCancel, onConfirm }: { people: AdminPerson[]; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const title = people.length === 1 ? `Eliminar ${people[0].name}?` : `Eliminar ${people.length} pessoas?`;
  const online = people.filter((p) => p.online);
  const accounts = people.filter((p) => p.account);
  return (
    <Modal open onClose={onCancel} label={title}>
      <ModalHeader title={title} onClose={busy ? undefined : onCancel} />
      <div className="space-y-3 px-5 py-4 text-sm">
        {people.length > 1 && (
          <p className="text-muted">
            {people
              .slice(0, 8)
              .map((p) => p.name)
              .join(', ')}
            {people.length > 8 && ` e mais ${people.length - 8}`}
          </p>
        )}
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>Sai de todas as secções e salas, com as opiniões, fotos e mensagens.</li>
          <li>Os títulos que adicionou também saem, menos os que tiverem opiniões ou fotos de colegas.</li>
          {accounts.length > 0 && (
            <li>
              {accounts.length === 1 ? `A conta @${accounts[0].account!.username} é apagada.` : `As ${accounts.length} contas são apagadas.`}
            </li>
          )}
          <li>Se voltar a abrir a app, entra como uma pessoa nova.</li>
        </ul>
        {online.length > 0 && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            {online.map((p) => p.name).join(', ')} {online.length === 1 ? 'está' : 'estão'} online agora.
          </p>
        )}
        <p className="font-medium">Não dá para desfazer.</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner size={14} /> : <Trash2 size={14} />} Eliminar
        </Button>
      </div>
    </Modal>
  );
}

// --- Salas ---------------------------------------------------------------------------------------

function RoomsTab({ user, rooms, onChanged }: { user: LocalUser & { account: string }; rooms: AdminRoom[]; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<AdminRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const q = sameName(query);
  const shown = rooms.filter((r) => !q || sameName(r.name).includes(q) || r.id.includes(q));

  const remove = async (room: AdminRoom) => {
    setBusy(true);
    try {
      await deleteRoom(user, room.id);
      toast(`Sala «${room.name}» eliminada.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível eliminar a sala.', 'error');
    } finally {
      setBusy(false);
      setConfirming(null);
      await onChanged();
    }
  };

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input className={`${inputClass} pl-9`} placeholder="Procurar por nome ou código" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Procurar salas" />
      </label>
      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{rooms.length ? 'Nenhuma sala encontrada.' : 'Ainda não há salas.'}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-room={r.id}>
              <span className="text-2xl" aria-hidden>
                {kindInfo(r.kind).emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{r.name}</span>
                  <span className="font-mono text-xs text-faint">{r.id}</span>
                  {r.listed && <Chip className="bg-surface-3 text-muted">Aberta</Chip>}
                  {r.online > 0 && <Chip color="#15803d">{r.online} online</Chip>}
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  {plural(r.members, 'membro', 'membros')} · {plural(r.titles, 'título', 'títulos')} · atualizada {timeAgo(r.updatedAt)}
                  {r.createdAt ? ` · criada ${timeAgo(r.createdAt)}` : ''}
                </p>
              </div>
              <a
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-fg/5 hover:text-fg"
                href={roomPath(r.id)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Abrir
              </a>
              <Button size="sm" variant="ghost" className="text-bad hover:bg-bad/10" onClick={() => setConfirming(r)} aria-label={`Eliminar ${r.name}`}>
                <Trash2 size={15} /> <span className="hidden sm:inline">Eliminar</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <Modal open onClose={() => !busy && setConfirming(null)} label={`Eliminar ${confirming.name}?`}>
          <ModalHeader title={`Eliminar a sala «${confirming.name}»?`} onClose={busy ? undefined : () => setConfirming(null)} />
          <div className="space-y-2 px-5 py-4 text-sm text-muted">
            <p>
              Tem {plural(confirming.members, 'membro', 'membros')} e {plural(confirming.titles, 'título', 'títulos')}. Quem lá está deixa de a
              poder abrir e as fotos da sala são apagadas.
            </p>
            <p className="font-medium text-fg">Não dá para desfazer.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void remove(confirming)} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Trash2 size={14} />} Eliminar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
