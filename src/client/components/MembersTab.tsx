import { useMemo, useState } from 'react';
import { Crown, LayoutGrid } from 'lucide-react';
import { ownerAway } from '../../shared/owner';
import { affinity, memberStats } from '../../shared/stats';
import { genreLabel } from '../lib/anime-api';
import { formatStars, timeAgo } from '../lib/format';
import { describePresence } from '../lib/presence-text';
import { useRoom } from './RoomContext';
import { Avatar, Button } from './ui';
import { Cover } from './Cover';

/** The community space can have hundreds of people: the others appear on demand. */
const MAX_CARDS = 60;

export function MembersTab() {
  const { room, me, snap, titleOf, setTab, setBoard, openAnime, noun, dispatch, memberName } = useRoom();
  const iOwn = room.createdBy === me;
  // The owner has been away for a week (or lost their profile): anyone can take the room over.
  const canTakeOver =
    !room.global && !iOwn && ownerAway(room, snap.lastSeen, !!room.createdBy && !!snap.presence[room.createdBy]);
  const [showAll, setShowAll] = useState(false);

  const members = useMemo(
    () =>
      Object.values(room.members).sort(
        (a, b) =>
          Number(b.id === me) - Number(a.id === me) ||
          Number(!!snap.presence[b.id]) - Number(!!snap.presence[a.id]) ||
          a.name.localeCompare(b.name),
      ),
    [room.members, snap.presence, me],
  );

  return (
    <div className="space-y-3">
      {canTakeOver && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          <Crown size={18} className="shrink-0 text-violet-300" />
          <p className="min-w-48 flex-1">
            {room.createdBy && room.members[room.createdBy]
              ? `O dono da sala (${memberName(room.createdBy)}) não aparece há mais de uma semana.`
              : 'Esta sala não tem dono.'}{' '}
            <span className="text-muted">Quem ficar com ela passa a poder mudar o nome da sala.</span>
          </p>
          <Button size="sm" variant="primary" onClick={() => dispatch({ type: 'room.owner', to: me })}>
            Ficar com a sala
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {(showAll ? members : members.slice(0, MAX_CARDS)).map((m) => {
          const stats = memberStats(room, m.id);
          const online = m.id === me || !!snap.presence[m.id];
          const p = snap.presence[m.id];
          const aff = m.id === me ? null : affinity(room, me, m.id);
          return (
            <div key={m.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <Avatar member={m} size={44} online={online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.name} {m.id === me && <span className="text-xs font-normal text-faint">(tu)</span>}
                    {room.createdBy === m.id && (
                      <span className="ml-1 text-xs" title="Dono da sala: só ele pode mudar o nome da sala">
                        👑
                      </span>
                    )}
                  </p>
                  {m.unit && <p className="truncate text-xs text-faint">🏢 {m.unit}</p>}
                  <p className="truncate text-xs text-muted">
                    {m.id === me
                      ? 'Online'
                      : p
                        ? describePresence(p, room, me, titleOf)
                        : snap.lastSeen[m.id]
                          ? `Visto ${timeAgo(snap.lastSeen[m.id])}`
                          : 'Offline'}
                  </p>
                </div>
                {iOwn && m.id !== me && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Passar a sala a ${m.name}`}
                    title={`Passar a sala a ${m.name}`}
                    onClick={() => {
                      if (!confirm(`Passar a sala a ${m.name}? Passa a ser ${m.name} a poder mudar o nome da sala.`)) return;
                      dispatch({ type: 'room.owner', to: m.id });
                    }}
                  >
                    <Crown size={15} />
                  </Button>
                )}
                {!room.global && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setBoard(m.id);
                      setTab('tierlist');
                    }}
                    title="Ver a tierlist"
                  >
                    <LayoutGrid size={15} />
                  </Button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'avaliados', value: stats.rated },
                  { label: 'estrelas (média)', value: stats.avg != null ? `★ ${formatStars(stats.avg)}` : '—', color: stats.avg != null ? '#fbbf24' : undefined },
                  { label: 'recomenda', value: stats.recommended },
                  { label: 'opiniões', value: stats.opinions },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-surface-2 px-1 py-2">
                    <p className="text-base font-bold" style={s.color ? { color: s.color } : undefined}>
                      {s.value}
                    </p>
                    <p className="text-[10px] text-faint">{s.label}</p>
                  </div>
                ))}
              </div>

              {aff && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted">Afinidade contigo</span>
                    <span className="font-semibold">
                      {aff.score != null ? `${aff.score}%` : '—'}
                      <span className="font-normal text-faint"> · {aff.common} em comum</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all"
                      style={{ width: `${aff.score ?? 0}%` }}
                    />
                  </div>
                  {aff.score == null && (
                    <p className="mt-1 text-[11px] text-faint">
                      Avaliem pelo menos 2 {noun.many} em comum para ver a afinidade.
                    </p>
                  )}
                </div>
              )}

              {(stats.favourites.length > 0 || stats.topGenres.length > 0) && (
                <div className="mt-3 flex items-end gap-3">
                  <div className="flex gap-1.5">
                    {stats.favourites.map((k) => (
                      <button key={k} onClick={() => openAnime(k)} title={titleOf(room.anime[k])}>
                        <Cover meta={room.anime[k]} className="h-14 w-10 rounded-md" />
                      </button>
                    ))}
                  </div>
                  {stats.topGenres.length > 0 && (
                    <p className="min-w-0 text-[11px] leading-snug text-muted">
                      Gosta de <span className="text-fg">{stats.topGenres.map(genreLabel).join(', ')}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!showAll && members.length > MAX_CARDS && (
        <div className="flex justify-center">
          <Button variant="subtle" onClick={() => setShowAll(true)}>
            Ver todos ({members.length})
          </Button>
        </div>
      )}
    </div>
  );
}
