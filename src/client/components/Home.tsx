import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, History, LogIn, MessagesSquare, Plus, Radio, Search, Sparkles, Trash2, Users } from 'lucide-react';
import { LIMITS } from '../../shared/constants';
import type { AnimeMeta } from '../../shared/types';
import { browseAnime } from '../lib/anime-api';
import { timeAgo } from '../lib/format';
import type { LocalUser } from '../lib/identity';
import { forgetRoom, recentRooms, type RecentRoom } from '../lib/recent-rooms';
import { navigate, parseRoomInput } from '../lib/router';
import { Avatar, Button, Spinner, inputClass } from './ui';
import { ProfileDialog } from './ProfileDialog';
import { Logo } from './Logo';
import { useToast } from './Toasts';

export function Home({ user, setUser }: { user: LocalUser | null; setUser: (u: LocalUser) => void }) {
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [afterProfile, setAfterProfile] = useState<(() => void) | null>(null);
  const [recent, setRecent] = useState<RecentRoom[]>(() => recentRooms());
  const [covers, setCovers] = useState<AnimeMeta[]>([]);
  const toast = useToast();

  useEffect(() => {
    document.title = 'Anime Tierlist Live';
    let alive = true;
    browseAnime({ sort: 'trending' })
      .then((r) => alive && setCovers(r.items.slice(0, 24)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const withProfile = (action: () => void) => {
    if (user) return action();
    setAfterProfile(() => action);
    setProfileOpen(true);
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
          body: JSON.stringify({ name }),
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
            onClick={() => setProfileOpen(true)}
          >
            <Avatar member={user} size={28} />
            <span className="max-w-32 truncate font-medium">{user.name}</span>
          </button>
        ) : (
          <Button size="sm" variant="subtle" onClick={() => setProfileOpen(true)}>
            Criar perfil
          </Button>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-violet-200">
            <Radio size={13} className="animate-pulse" /> Em tempo real com os teus colegas
          </p>
          <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-6xl">
            A tierlist de anime <span className="text-gradient">da tua turma</span>
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
            Pesquisa qualquer anime, arrasta-o para o tier certo e dá a tua nota, opinião e recomendação. Todos veem
            tudo a acontecer ao vivo.
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
            <p className="mb-3 text-sm text-muted">Cria a sala e partilha o link com quem quiseres.</p>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Nome da sala (ex.: Turma ESTG)"
                maxLength={LIMITS.roomName}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={creating}>
                {creating ? <Spinner size={16} /> : <ArrowRight size={18} />}
                Criar
              </Button>
            </div>
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

        {recent.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
              <History size={15} /> As tuas salas
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((r) => (
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
                    aria-label="Esquecer sala"
                    onClick={() => {
                      forgetRoom(r.id);
                      setRecent(recentRooms());
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Search size={18} />, title: 'Todos os animes', text: 'Pesquisa no catálogo completo do AniList: dezenas de milhares de títulos.' },
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
        </footer>
      </main>

      <ProfileDialog
        open={profileOpen}
        user={user}
        onSave={(u) => {
          setUser(u);
          const next = afterProfile;
          setAfterProfile(null);
          if (next) setTimeout(next, 0);
        }}
        onClose={() => {
          setProfileOpen(false);
          setAfterProfile(null);
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
