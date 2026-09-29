import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { CONSENSUS_BOARD, POOL, type Board, type Member } from '../../shared/types';
import { readableOn } from '../lib/format';
import { allThe, none } from '../lib/words';
import { AnimeCardView, CARD_SIZES, type AnimeCardProps } from './AnimeCard';
import { RemoteCursors } from './RemoteCursors';
import { useRoom } from './RoomContext';
import { Button, cn } from './ui';

interface Target {
  zone: string;
  index: number;
}

interface Indicator {
  id: string;
  /** card excluded when counting positions (the one being dragged) */
  exclude: string;
  index: number;
  color: string;
  label: string | null;
}

/** Key in front of which a drop indicator goes (null = at the end). */
function insertBefore(keys: string[], exclude: string, index: number): string | null {
  let n = 0;
  for (const k of keys) {
    if (k === exclude) continue;
    if (n === index) return k;
    n++;
  }
  return null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function TierBoard({
  boardId,
  lists,
  pool,
  editable,
  votes,
  onAdd,
}: {
  boardId: string;
  lists: Board;
  pool: string[];
  editable: boolean;
  votes?: Record<string, number>;
  onAdd: () => void;
}) {
  const { room, client, me, snap, dispatch, prefs, openAnime, titleOf, summaries, noun, place } = useRoom();
  const size = prefs.cardSize;
  const cardH = CARD_SIZES[size].h;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [filter, setFilter] = useState('');
  const [trayOpen, setTrayOpen] = useState(true);
  const pointer = useRef({ x: 0, y: 0 });
  const justDropped = useRef(false);
  const lastAnnounced = useRef('');

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const tierOf = (key: string) => room.tiers.find((t) => lists[t.id]?.includes(key))?.id ?? null;

  /**
   * Where would the card land? Real DOM hit-testing (the drag overlay has pointer-events: none),
   * so the sticky "Por classificar" tray correctly wins over the tier rows behind it.
   */
  const computeTarget = (key: string): Target | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const { x, y } = pointer.current;
    const zoneEl = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
    if (!zoneEl || !wrap.contains(zoneEl)) return null;
    const zone = zoneEl.dataset.drop!;
    if (zone === POOL) return { zone: POOL, index: 0 };
    let index = 0;
    for (const card of zoneEl.querySelectorAll<HTMLElement>('[data-card]')) {
      if (card.dataset.card === key) continue;
      const r = card.getBoundingClientRect();
      if (r.bottom < y || (r.top <= y && r.left + r.width / 2 < x)) index++;
      else break;
    }
    return { zone, index };
  };

  const announce = (key: string | null, t: Target | null) => {
    const sig = key ? `${key}|${t?.zone ?? ''}|${t?.index ?? ''}` : '';
    if (sig === lastAnnounced.current) return;
    lastAnnounced.current = sig;
    client.setPresence({
      dragging: key ? { key, over: t?.zone ?? null, index: t && t.zone !== POOL ? t.index : null } : null,
    });
  };

  // While dragging: follow the real pointer, auto-scroll near the edges and recompute the drop position.
  // (dnd-kit's own auto-scroll is off: it would scroll as soon as a drag starts in the bottom tray.)
  // Scrolling only kicks in after the pointer rests a moment in an edge zone, so merely passing
  // through the strip above the tray (on the way up from it) does not move the page.
  useEffect(() => {
    if (!activeKey) return;
    const key = activeKey;
    const EDGE = 80;
    let frame = 0;
    let zone: 'up' | 'down' | null = null;
    let zoneSince = 0;
    let beenAboveTray = false;
    const tick = (now: number) => {
      const { y } = pointer.current;
      const top = (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + EDGE;
      const trayTop = wrapRef.current?.querySelector('[data-testid="pool"]')?.getBoundingClientRect().top ?? window.innerHeight;
      if (y < trayTop - EDGE) beenAboveTray = true;
      const current = y < top ? 'up' : beenAboveTray && y < trayTop && y > trayTop - EDGE ? 'down' : null;
      if (current !== zone) {
        zone = current;
        zoneSince = now;
      }
      if (zone && now - zoneSince > 220) {
        const depth = zone === 'up' ? (top - y) / EDGE : (y - (trayTop - EDGE)) / EDGE;
        window.scrollBy(0, (zone === 'up' ? -1 : 1) * Math.ceil(4 + Math.min(1, depth) * 14));
      }
      const t = computeTarget(key);
      setTarget((prev) => (prev?.zone === t?.zone && prev?.index === t?.index ? prev : t));
      announce(key, t);
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e;
      if (p) pointer.current = { x: p.clientX, y: p.clientY };
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('touchmove', move);
    };
    // computeTarget/announce only read refs and the current layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // Never leave a stale "X is moving…" behind if the board unmounts mid-drag.
  useEffect(
    () => () => {
      if (lastAnnounced.current) client.setPresence({ dragging: null });
    },
    [client],
  );

  const onDragStart = (e: DragStartEvent) => {
    const key = String(e.active.id);
    const ev = e.activatorEvent as MouseEvent | TouchEvent;
    const p = 'touches' in ev ? ev.touches[0] : ev;
    if (p) pointer.current = { x: p.clientX, y: p.clientY };
    setActiveKey(key);
    announce(key, null);
  };

  const finish = () => {
    setActiveKey(null);
    setTarget(null);
    announce(null, null);
    justDropped.current = true;
    setTimeout(() => (justDropped.current = false), 60);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const key = String(e.active.id);
    const t = computeTarget(key);
    finish();
    if (!t || !editable) return;
    const from = tierOf(key);
    if (t.zone === POOL) {
      if (from) dispatch({ type: 'board.move', board: boardId, key, to: POOL, index: 0 });
      return;
    }
    if (from === t.zone && lists[from]?.indexOf(key) === t.index) return;
    dispatch({ type: 'board.move', board: boardId, key, to: t.zone, index: t.index });
  };

  // --- other people, live -------------------------------------------------------
  const remote = useMemo(
    () =>
      Object.values(snap.presence)
        .filter((p) => p.board === boardId && p.dragging && room.members[p.userId] && room.anime[p.dragging.key])
        .map((p) => ({ member: room.members[p.userId], ...p.dragging! })),
    [snap.presence, boardId, room.members, room.anime],
  );

  const movedBy = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const r of remote) m[r.key] = r.member;
    return m;
  }, [remote]);

  const viewers = useMemo(() => {
    const v: Record<string, Member[]> = {};
    for (const p of Object.values(snap.presence)) {
      if (p.viewing && room.members[p.userId]) (v[p.viewing] ??= []).push(room.members[p.userId]);
    }
    return v;
  }, [snap.presence, room.members]);

  const myColor = room.members[me]?.color ?? '#8b5cf6';
  const indicators = useMemo(() => {
    const byZone: Record<string, Indicator[]> = {};
    if (activeKey && target && target.zone !== POOL) {
      (byZone[target.zone] ??= []).push({ id: 'me', exclude: activeKey, index: target.index, color: myColor, label: null });
    }
    for (const r of remote) {
      if (!r.over || r.over === POOL || r.index == null) continue;
      (byZone[r.over] ??= []).push({ id: r.member.id, exclude: r.key, index: r.index, color: r.member.color, label: r.member.name });
    }
    return byZone;
  }, [activeKey, target, remote, myColor]);

  const zoneHighlight = (zone: string): string | undefined => {
    if (activeKey && target?.zone === zone) return myColor;
    return remote.find((r) => r.over === zone)?.member.color;
  };

  // --- live cursor -------------------------------------------------------------------
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]');
    if (!zone?.dataset.zone) return;
    const r = zone.getBoundingClientRect();
    client.sendCursor({
      board: boardId,
      zone: zone.dataset.zone,
      fx: clamp01((e.clientX - r.left) / r.width),
      fy: clamp01((e.clientY - r.top) / r.height),
    });
  };

  const cardProps = (key: string): (AnimeCardProps & { id: string }) | null => {
    const anime = room.anime[key];
    if (!anime) return null;
    return {
      id: key,
      anime,
      title: titleOf(anime),
      size,
      rating: summaries[key]?.avg ?? null,
      movedBy: movedBy[key] ?? null,
      flash: snap.flashes[key]?.color ?? null,
      viewers: viewers[key],
      badge: votes ? `${votes[key] ?? 0}🗳` : null,
    };
  };

  const renderCards = (zone: string, keys: string[]) => {
    const placed = (indicators[zone] ?? []).map((ind) => ({ ...ind, before: insertBefore(keys, ind.exclude, ind.index) }));
    const out: ReactNode[] = [];
    for (const k of keys) {
      for (const ind of placed) if (ind.before === k) out.push(<DropIndicator key={`ind-${ind.id}`} {...ind} height={cardH} />);
      const props = cardProps(k);
      if (props) out.push(<DraggableCard key={k} {...props} disabled={!editable} onOpen={openAnime} justDropped={justDropped} />);
    }
    for (const ind of placed) if (ind.before === null) out.push(<DropIndicator key={`ind-${ind.id}`} {...ind} height={cardH} />);
    return out;
  };

  const q = filter.trim().toLowerCase();
  const shownPool = q
    ? pool.filter((k) => {
        const a = room.anime[k];
        return a && [a.title, a.titleEnglish, a.titleNative].some((t) => t?.toLowerCase().includes(q));
      })
    : pool;
  const labelClass = (label: string) =>
    label.length <= 2 ? 'text-2xl sm:text-3xl' : label.length <= 5 ? 'text-base sm:text-xl' : 'text-[11px] sm:text-sm leading-tight';
  const poolHighlight = zoneHighlight(POOL);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={finish} autoScroll={false}>
      <div ref={wrapRef} className="no-drag-img relative" onPointerMove={onPointerMove} onPointerLeave={() => client.sendCursor(null)}>
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/20" data-testid="tiers">
          {room.tiers.map((tier) => {
            const highlight = zoneHighlight(tier.id);
            return (
              <div key={tier.id} data-zone={tier.id} className="flex border-b border-line last:border-b-0">
                <div
                  className="flex w-14 shrink-0 items-center justify-center p-1.5 text-center font-black break-words sm:w-24"
                  style={{ background: tier.color, color: readableOn(tier.color) }}
                >
                  <span className={labelClass(tier.label)}>{tier.label}</span>
                </div>
                <div
                  data-drop={tier.id}
                  className={cn('flex flex-1 flex-wrap content-start items-start p-[5px] transition-colors', highlight && 'bg-white/[0.035]')}
                  style={{ minHeight: cardH + 16, boxShadow: highlight ? `inset 0 0 0 2px ${highlight}` : undefined }}
                >
                  {renderCards(tier.id, lists[tier.id] ?? [])}
                </div>
              </div>
            );
          })}
        </div>

        <section
          data-zone={POOL}
          data-drop={POOL}
          data-testid="pool"
          className="sticky bottom-[calc(62px+env(safe-area-inset-bottom))] z-20 mt-4 rounded-xl border bg-surface/95 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md transition-colors lg:bottom-3"
          style={{ borderColor: poolHighlight ?? 'var(--color-line)', boxShadow: poolHighlight ? `0 0 0 1px ${poolHighlight}` : undefined }}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <button
              className="flex items-center gap-1.5 text-sm font-semibold"
              onClick={() => setTrayOpen((v) => !v)}
              aria-expanded={trayOpen}
              title={trayOpen ? 'Esconder' : 'Mostrar'}
            >
              {trayOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              Por classificar <span className="font-normal text-faint">({pool.length})</span>
            </button>
            {editable && trayOpen && pool.length > 0 && (
              <span className="hidden text-xs text-faint md:inline">Arrasta para um tier · clica para ver e avaliar</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {pool.length > 8 && trayOpen && (
                <label className="relative">
                  <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filtrar…"
                    className="h-8 w-32 rounded-lg border border-line-2 bg-surface-2 pr-2 pl-8 text-sm outline-none focus:border-accent sm:w-44"
                  />
                </label>
              )}
              {/* In the community space everyone starts on its tier list: adding must be right there. */}
              {(boardId !== CONSENSUS_BOARD || room.global) && (
                <Button size="sm" variant="primary" onClick={onAdd}>
                  <Plus size={15} /> Adicionar {noun.one}
                </Button>
              )}
            </div>
          </div>
          {trayOpen && pool.length > 0 && (
            <div
              className="flex max-h-[26vh] flex-wrap content-start items-start overflow-y-auto border-t border-line p-[5px] lg:max-h-[30vh]"
              style={{ minHeight: cardH + 12 }}
            >
              {shownPool.map((k) => {
                const props = cardProps(k);
                return props ? (
                  <DraggableCard key={k} {...props} disabled={!editable} onOpen={openAnime} justDropped={justDropped} />
                ) : null;
              })}
              {shownPool.length === 0 && (
                <p className="w-full px-3 py-3 text-center text-sm text-muted">
                  {none(noun)} {noun.one} com esse nome.
                </p>
              )}
            </div>
          )}
          {trayOpen && pool.length === 0 && (
            <p className="border-t border-line px-3 py-2.5 text-center text-sm text-muted">
              {Object.keys(room.anime).length === 0
                ? `${place.The} ainda não tem ${noun.many}. Clica em «Adicionar ${noun.one}» ou vai a Explorar.`
                : boardId === CONSENSUS_BOARD
                  ? `${allThe(noun)} ${noun.many} já têm pelo menos um voto.`
                  : 'Tudo classificado! 🎉'}
            </p>
          )}
        </section>

        <RemoteCursors boardId={boardId} containerRef={wrapRef} />
      </div>

      <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
        {activeKey && room.anime[activeKey] ? (
          <AnimeCardView anime={room.anime[activeKey]} title={titleOf(room.anime[activeKey])} size={size} lifted />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DropIndicator({ color, label, height }: { color: string; label: string | null; height: number }) {
  return (
    <span className="relative w-0 self-start" style={{ height: height + 6 }} aria-hidden>
      <span
        className="absolute top-[3px] -left-[2px] w-1 rounded-full"
        style={{ height, background: color, boxShadow: `0 0 10px ${color}` }}
        data-testid="drop-indicator"
      />
      {label && (
        <span
          className="absolute -top-1.5 left-1 z-10 rounded px-1 text-[9px] leading-4 font-bold whitespace-nowrap text-white"
          style={{ background: color }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

const DraggableCard = memo(function DraggableCard({
  id,
  disabled,
  onOpen,
  justDropped,
  ...card
}: AnimeCardProps & {
  id: string;
  disabled: boolean;
  onOpen: (key: string) => void;
  justDropped: RefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      data-card={id}
      {...attributes}
      {...(disabled ? {} : listeners)}
      role="button"
      tabIndex={0}
      aria-label={card.title}
      title={card.title}
      onClick={() => {
        if (!justDropped.current) onOpen(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(id);
        }
      }}
      className={cn(
        'm-[3px] rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent',
        disabled ? 'cursor-pointer' : 'cursor-grab touch-manipulation active:cursor-grabbing',
      )}
    >
      <AnimeCardView {...card} dimmed={isDragging} />
    </div>
  );
});
