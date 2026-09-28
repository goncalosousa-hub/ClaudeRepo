import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, History, KeyRound, LogIn, MessagesSquare, Plus, Radio, Search, Sparkles, Trash2, Users } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import type { AnimeMeta, RoomKind } from '../../shared/types';
import { browseAnime } from '../lib/anime-api';
import { browseTmdb, tmdbAvailable } from '../lib/tmdb-api';
import { timeAgo } from '../lib/format';
import { AccountError, fetchAccount, forgetAccountRoom, hasAccount, type AccountRoom } from '../lib/account-api';
import { saveUser, type LocalUser } from '../lib/identity';
import { forgetRoom, recentRooms, type RecentRoom } from '../lib/recent-rooms';
import { navigate, parseRoomInput } from '../lib/router';
import { KINDS } from '../lib/words';
import { Avatar, Button, Segmented, Spinner, inputClass } from './ui';
import { ProfileDialog, type ProfileDialogMode } from './ProfileDialog';
import { Logo } from './Logo';
import { useToast } from './Toasts';

export function Home({ user, setUser }: { user: LocalUser | null; setUser: (u: LocalUser) => void }) {
  const [roomName, setRoomName] = useState('');
  const [kind, setKind] = useState<RoomKind>('anime');
  const [tmdb, setTmdb] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<{ mode: ProfileDialogMode; focusAccount?: boolean } | null>(null);
  const [afterProfile, setAfterProfile] = useState<(() => void) | null>(null);
  const [recent, setRecent] = useState<RecentRoom[]>(() => recentRooms());
  const [accountRooms, setAccountRooms] = useState<AccountRoom[] | null>(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [covers, setCovers] = useState<AnimeMeta[]>([]);
  const toast = useToast();

  // With an account, "As tuas salas" come from the server (the same on every link and device).
  const account = user?.account;
  const secret = user?.secret;
  useEffect(() => {
    setAccountRooms(null);
    if (!hasAccount(user)) return;
    let alive = true;
    fetchAccount(user)
      .then((info) => {
        if (!alive) return;
        setAccountRooms(info.rooms);
        // The profile may have been changed on another device.
        const { name, color, avatar } = info.profile;
        if (name !== user.name || color !== user.color || avatar !== user.avatar) saveUser({ ...user, name, color, avatar });
      })
      .catch((err) => {
        if (!alive || !(err instanceof AccountError) || err.code !== 'unauthorized') return;
        // The account does not exist on this server (e.g. a new database): keep the profile, drop the link to it.
        const { account: _gone, ...profile } = user;
        saveUser(profile);
        toast(`A conta @${user.account} não existe neste servidor. O teu perfil continua aqui: podes criá-la outra vez.`, 'error');
      });
    return () => {
      alive = false;
    };
    // Only when the account changes (profile edits do not need a new request).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, secret]);

  // Signed in: the account's list (this browser's history only until it loads, or without account).
  const rooms = accountRooms ?? recent;
  const visibleRooms = showAllRooms ? rooms : rooms.slice(0, 9);

  useEffect(() => {
    document.title = 'Tierlist Live';
    let alive = true;
    const trending = (p: Promise<{ items: AnimeMeta[] }>) => p.then((r) => r.items).catch(() => [] as AnimeMeta[]);
    void (async () => {
      const [anime, available] = await Promise.all([trending(browseAnime({ sort: 'trending' })), tmdbAvailable()]);
      if (!alive) return;
      setTmdb(available);
      setCovers(anime.slice(0, 24));
      if (!available) return;
      // Series and movies in the background too, mixed with the anime.
      const [tv, movies] = await Promise.all([
        trending(browseTmdb('tv', { sort: 'trending' })),
        trending(browseTmdb('movie', { sort: 'trending' })),
      ]);
      if (!alive || (!tv.length && !movies.length)) return;
      const mixed: AnimeMeta[] = [];
      for (let i = 0; mixed.length < 24 && i < 24; i++) for (const list of [anime, tv, movies]) if (list[i]) mixed.push(list[i]);
      setCovers(mixed.slice(0, 24));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const withProfile = (action: () => void) => {
    if (user) return action();
    setAfterProfile(() => action);
    setDialog({ mode: 'profile' });
  };

  const forget = (id: string) => {
    forgetRoom(id);
    setRecent(recentRooms());
    if (!hasAccount(user)) return;
    setAccountRooms((list) => list && list.filter((r) => r.id !== id));
    forgetAccountRoom(user, id).catch((err) => toast(err instanceof Error ? err.message : 'Erro.', 'error'));
  };

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    const name = roomName.trim() || 'A nossa tierlist';
    withProfile(async () => {
      setCreating(true);
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, kind }),
        });
        if (res.status === 429) throw new Error('Criaste muitas salas seguidas. Espera uns minutos.');
        if (!res.ok) throw new Error('Não foi possível criar a sala.');
        const { id } = (await res.json()) as { id: string };
        navigate(`/r/${id}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Erro ao criar a sala.', 'error');
        setCreating(false);
      }
    });
  };

  const joinRoom = (e: FormEvent) => {
    e.preventDefault();
    const id = parseRoomInput(code);
    if (!id) return toast('Cola o link da sala ou escreve o código (ex.: k7x2pq9m).', 'error');
    withProfile(() => navigate(`/r/${id}`));
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <CoverCollage covers={covers} />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        {user ? (
          <button
            className="flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pr-3 pl-1 text-sm backdrop-blur hover:border-line-2"
            onClick={() => setDialog({ mode: 'profile' })}
            aria-label={`O teu perfil (${user.name})`}
          >
            <Avatar member={user} size={28} />
            <span className="max-w-32 truncate font-medium">{user.name}</span>
            {user.account && <span className="hidden text-xs text-faint sm:inline">@{user.account}</span>}
          </button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" aria-label="Entrar na conta" onClick={() => setDialog({ mode: 'login' })}>
              <LogIn size={15} /> Entrar
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setDialog({ mode: 'profile' })}>
              Criar perfil
            </Button>
          </div>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-violet-200">
            <Radio size={13} className="animate-pulse" /> Em tempo real com os teus colegas
          </p>
          <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
            A tierlist <span className="text-gradient">da tua turma</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
            Anime, séries ou filmes: pesquisa qualquer título, arrasta-o para o tier certo e dá a tua nota, opinião e
            recomendação. Todos veem tudo a acontecer ao vivo.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <form onSubmit={createRoom} className="rounded-2xl border border-line bg-surface/85 p-5 backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2">
                <Plus size={18} />
              </span>
              <h2 className="font-semibold">Criar uma sala</h2>
            </div>
            <p className="mb-3 text-sm text-muted">Escolhe o que vão classificar e partilha o link com quem quiseres.</p>
            <Segmented
              className="mb-3 max-w-full overflow-x-auto"
              value={kind}
              onChange={setKind}
              options={KINDS.map((k) => ({ value: k.id, label: `${k.emoji} ${k.label}` }))}
            />
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Nome da sala (ex.: Turma ESTG)"
                maxLength={LIMITS.roomName}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={creating || (kind !== 'anime' && tmdb === false)}>
                {creating ? <Spinner size={16} /> : <ArrowRight size={18} />}
                Criar
              </Button>
            </div>
            {kind !== 'anime' && tmdb === false && (
              <p className="mt-2 text-xs text-amber-200">
                As séries e os filmes ainda não estão ativos neste servidor: falta a chave do TMDB (TMDB_API_KEY). O
                README explica como a obter, de graça.
              </p>
            )}
            {kind === 'all' && tmdb !== false && (
              <p className="mt-2 text-xs text-faint">Anime, séries e filmes na mesma tierlist.</p>
            )}
          </form>

          <form onSubmit={joinRoom} className="rounded-2xl border border-line bg-surface/85 p-5 backdrop-blur">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 ring-1 ring-line-2">
                <LogIn size={17} />
              </span>
              <h2 className="font-semibold">Entrar numa sala</h2>
            </div>
            <p className="mb-3 text-sm text-muted">Recebeste um link ou um código? Cola-o aqui.</p>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Link ou código da sala"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button type="submit">Entrar</Button>
            </div>
          </form>
        </div>

        {(rooms.length > 0 || (user && !user.account)) && (
          <section className="mt-8" aria-label="As tuas salas">
            <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
              <History size={15} /> As tuas salas
              {accountRooms && <span className="text-xs font-normal text-faint">· guardadas na conta @{user?.account}</span>}
            </h2>
            {user && !user.account && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm backdrop-blur">
                <KeyRound size={17} className="shrink-0 text-violet-300" />
                <p className="min-w-48 flex-1">
                  <span className="font-medium">Guarda o teu perfil numa conta</span>
                  <span className="text-muted">
                    {' '}
                    para entrares como tu em qualquer link ou dispositivo e nunca perderes as tuas salas.
                  </span>
                </p>
                <Button size="sm" variant="primary" onClick={() => setDialog({ mode: 'profile', focusAccount: true })}>
                  Criar conta
                </Button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRooms.map((r) => (
                <div
                  key={r.id}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface/85 px-4 py-3 backdrop-blur transition hover:border-line-2"
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => withProfile(() => navigate(`/r/${r.id}`))}>
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-faint">
                      {r.id} · {timeAgo(r.visitedAt)}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Esquecer a sala ${r.name}`}
                    title="Tirar da lista (a sala continua a existir)"
                    onClick={() => forget(r.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
            {rooms.length > visibleRooms.length && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAllRooms(true)}>
                Ver todas ({rooms.length})
              </Button>
            )}
          </section>
        )}

        <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Search size={18} />, title: 'Anime, séries e filmes', text: 'Catálogos completos do AniList e do TMDB: centenas de milhares de títulos.' },
            { icon: <Users size={18} />, title: 'Tierlist do grupo e tua', text: 'Uma tierlist partilhada, uma pessoal para cada um e a média de todos.' },
            { icon: <Sparkles size={18} />, title: 'Notas e recomendações', text: 'Dá nota de 1 a 10, escreve a tua opinião e diz se recomendas.' },
            { icon: <MessagesSquare size={18} />, title: 'Ao vivo', text: 'Vê os cursores, quem está a mover o quê, o chat e a atividade em direto.' },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface/70 p-4 backdrop-blur">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-violet-300">{f.icon}</div>
              <p className="font-semibold">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </section>

        <footer className="mt-12 text-xs text-faint">
          Dados de anime: <a className="underline hover:text-muted" href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>{' '}
          (com <a className="underline hover:text-muted" href="https://jikan.moe" target="_blank" rel="noreferrer">Jikan/MyAnimeList</a> como alternativa).
          Séries e filmes:{' '}
          <a className="underline hover:text-muted" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            TMDB
          </a>
          . Este produto usa a API do TMDB mas não é endossado nem certificado pelo TMDB.
        </footer>
      </main>

      <ProfileDialog
        open={!!dialog}
        user={user}
        initialMode={dialog?.mode}
        focusAccount={dialog?.focusAccount}
        onSave={(u) => {
          setUser(u);
          const next = afterProfile;
          setAfterProfile(null);
          if (next) setTimeout(next, 0);
        }}
        onClose={() => {
          setDialog(null);
          setAfterProfile(null);
          setRecent(recentRooms());
        }}
      />
    </div>
  );
}

function CoverCollage({ covers }: { covers: AnimeMeta[] }) {
  if (!covers.length) return <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -top-24 -right-40 grid w-[980px] rotate-[-8deg] grid-cols-6 gap-3 opacity-[0.22] sm:-right-24">
        {covers.map((a) => (
          <img key={a.key} src={a.cover} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/92 to-bg/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/60" />
    </div>
  );
}
