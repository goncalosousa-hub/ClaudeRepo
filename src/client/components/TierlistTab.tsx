import { useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Copy, Download, Eraser, Eye, Globe, Palette, Star, UserPlus, Users } from 'lucide-react';
import { consensusBoard, normalizedBoard, poolOf } from '../../shared/stats';
import { CONSENSUS_BOARD, GROUP_BOARD, type RoomKind } from '../../shared/types';
import { exportTierlistImage } from '../lib/export-image';
import { QuickAddDialog } from './QuickAddDialog';
import { useRoom } from './RoomContext';
import { TierBoard } from './TierBoard';
import { TierEditorDialog } from './TierEditorDialog';
import { useToast } from './Toasts';
import { Avatar, Button, Segmented, cn } from './ui';

const ADD_HINT: Record<RoomKind, string> = {
  anime: 'Pesquisa qualquer anime do AniList.',
  series: 'Pesquisa qualquer série do TMDB.',
  movies: 'Pesquisa qualquer filme do TMDB.',
  all: 'Pesquisa filmes, séries e animes.',
  books: 'Pesquisa qualquer livro da Open Library.',
  restaurants: 'Procura no mapa ou adiciona à mão.',
  places: 'Procura no mapa ou adiciona à mão.',
};

export function TierlistTab({ onShare }: { onShare: () => void }) {
  const { room, me, board, setBoard, snap, prefs, setPrefs, dispatch, titleOf, memberName, kind, noun } = useRoom();
  const [adding, setAdding] = useState(false);
  const [editingTiers, setEditingTiers] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  // The community space has no shared board: its tier list is everyone's average.
  const global = !!room.global;
  const fallback = global ? CONSENSUS_BOARD : GROUP_BOARD;
  const validBoard =
    (board === GROUP_BOARD && !global) || board === CONSENSUS_BOARD || room.members[board] ? board : fallback;
  const isConsensus = validBoard === CONSENSUS_BOARD;
  const editable = (validBoard === GROUP_BOARD && !global) || validBoard === me;

  const consensus = useMemo(() => (isConsensus ? consensusBoard(room) : null), [isConsensus, room]);
  const lists = useMemo(
    () => (consensus ? consensus.board : normalizedBoard(room, validBoard)),
    [consensus, room, validBoard],
  );
  const pool = useMemo(() => {
    if (consensus) return poolOf(room, consensus.board);
    return poolOf(room, room.boards[validBoard]);
  }, [consensus, room, validBoard]);

  const others = Object.values(room.members)
    .filter((m) => m.id !== me)
    .sort((a, b) => Number(!!snap.presence[b.id]) - Number(!!snap.presence[a.id]) || a.name.localeCompare(b.name));
  // Hundreds of people in the community: only the ones online get a shortcut (the rest are in Membros).
  const shortcuts = global ? others.filter((m) => snap.presence[m.id]).slice(0, 12) : others;

  const viewersOf = (id: string) =>
    Object.values(snap.presence).filter((p) => p.tab === 'tierlist' && (p.board ?? GROUP_BOARD) === id && room.members[p.userId]);

  const boardTitle =
    validBoard === GROUP_BOARD
      ? 'Tierlist do Grupo'
      : validBoard === CONSENSUS_BOARD
        ? global
          ? 'Tierlist da Comunidade'
          : 'Média do grupo'
        : validBoard === me
          ? `Tierlist de ${room.members[me]?.name ?? 'mim'}`
          : `Tierlist de ${memberName(validBoard)}`;

  const exportImage = async () => {
    setExporting(true);
    try {
      await exportTierlistImage({
        title: boardTitle,
        subtitle: room.name,
        tiers: room.tiers,
        lists,
        anime: room.anime,
        titleOf,
        photos: room.photos,
      });
    } catch (err) {
      console.error(err);
      toast('Não foi possível gerar a imagem.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const chip = (id: string, label: ReactNode, icon?: ReactNode, ariaLabel?: string) => {
    const viewers = viewersOf(id);
    const active = validBoard === id;
    return (
      <button
        key={id}
        aria-label={ariaLabel}
        aria-pressed={active}
        onClick={() => setBoard(id)}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition',
          active ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line bg-surface text-muted hover:border-line-2 hover:text-fg',
        )}
      >
        {icon}
        {label}
        {viewers.length > 0 && (
          <span className="ml-0.5 flex -space-x-1.5" title={viewers.map((p) => room.members[p.userId]?.name).join(', ')}>
            {viewers.slice(0, 3).map((p) => (
              <Avatar key={p.userId} member={room.members[p.userId]} size={18} />
            ))}
          </span>
        )}
      </button>
    );
  };

  const owner = !editable && !isConsensus ? room.members[validBoard] : null;
  const ownerHere = owner && snap.presence[owner.id]?.board === owner.id && snap.presence[owner.id]?.tab === 'tierlist';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {global && chip(CONSENSUS_BOARD, 'Comunidade', <Globe size={15} />)}
        {!global && chip(GROUP_BOARD, 'Grupo', <Users size={15} />)}
        {chip(me, 'A minha', <Star size={15} />)}
        {shortcuts.map((m) =>
          chip(
            m.id,
            <span className="max-w-28 truncate">{m.name}</span>,
            <Avatar member={m} size={18} online={!!snap.presence[m.id]} />,
            `Tierlist de ${m.name}`,
          ),
        )}
        {!global && chip(CONSENSUS_BOARD, 'Média', <BarChart3 size={15} />)}
        {others.length === 0 && (
          <Button size="sm" variant="ghost" onClick={onShare} className="shrink-0">
            <UserPlus size={15} /> Convida colegas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{boardTitle}</h2>
          <p className="text-xs text-muted">
            {validBoard === GROUP_BOARD && `Partilhada: todos podem arrastar ${noun.many} aqui, ao mesmo tempo.`}
            {validBoard === me && 'A tua tierlist pessoal. Todos a veem em direto e conta para a média.'}
            {isConsensus &&
              (global
                ? 'A média das tierlists pessoais de todos. Faz a tua em «A minha» para contar.'
                : 'Calculada automaticamente a partir das tierlists pessoais de todos (só leitura).')}
            {owner && (
              <span className="inline-flex items-center gap-1">
                <Eye size={12} /> Só leitura{ownerHere ? ` — ${owner.name} está a mexer nela agora` : ''}.
              </span>
            )}
          </p>
        </div>
        <Segmented
          size="sm"
          value={prefs.cardSize}
          onChange={(cardSize) => setPrefs({ cardSize })}
          options={[
            { value: 'sm', label: 'P', title: 'Cartas pequenas' },
            { value: 'md', label: 'M', title: 'Cartas médias' },
            { value: 'lg', label: 'G', title: 'Cartas grandes' },
          ]}
        />
        {validBoard === me && !global && (
          <>
            <Button
              size="sm"
              variant="ghost"
              title="Começar a partir da tierlist do grupo"
              onClick={() => {
                if (confirm('Substituir a tua tierlist por uma cópia da tierlist do Grupo?'))
                  dispatch({ type: 'board.copy', board: me, from: GROUP_BOARD });
              }}
            >
              <Copy size={15} /> <span className="hidden sm:inline">Copiar do grupo</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Pôr tudo em «Por classificar»"
              onClick={() => {
                if (confirm(`Limpar a tua tierlist? ${noun.f ? 'As' : 'Os'} ${noun.many} voltam para «Por classificar».`))
                  dispatch({ type: 'board.clear', board: me });
              }}
            >
              <Eraser size={15} /> <span className="hidden sm:inline">Limpar</span>
            </Button>
          </>
        )}
        {!global && (
          <Button size="sm" variant="ghost" onClick={() => setEditingTiers(true)}>
            <Palette size={15} /> <span className="hidden sm:inline">Tiers</span>
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={exportImage} disabled={exporting}>
          <Download size={15} /> <span className="hidden sm:inline">{exporting ? 'A gerar…' : 'Imagem'}</span>
        </Button>
      </div>

      {Object.keys(room.anime).length === 0 && (
        <div className="grid gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-transparent to-accent-2/10 p-4 sm:grid-cols-3">
          {[
            global
              ? { n: 1, title: 'Convida colegas', text: 'Partilha o link da comunidade.', action: onShare, cta: 'Convidar' }
              : { n: 1, title: 'Convida a turma', text: 'Partilha o link ou o QR code da sala.', action: onShare, cta: 'Convidar' },
            { n: 2, title: `Adiciona ${noun.many}`, text: ADD_HINT[kind], action: () => setAdding(true), cta: 'Adicionar' },
            global
              ? { n: 3, title: 'Dá a tua opinião', text: 'Põe na tua tierlist e dá a tua nota: conta para a média de todos.' }
              : { n: 3, title: 'Classifica e avalia', text: 'Arrasta para os tiers e dá a tua nota e opinião.' },
          ].map((s) => (
            <div key={s.n} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted">{s.text}</p>
                {s.action && (
                  <button className="mt-1 text-xs font-semibold text-accent hover:underline" onClick={s.action}>
                    {s.cta} →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TierBoard
        boardId={validBoard}
        lists={lists}
        pool={pool}
        editable={editable}
        votes={consensus?.votes}
        onAdd={() => setAdding(true)}
      />

      <QuickAddDialog open={adding} onClose={() => setAdding(false)} />
      <TierEditorDialog open={editingTiers} onClose={() => setEditingTiers(false)} />
    </div>
  );
}
