import { useEffect, useState } from 'react';
import { ExternalLink, Play, Plus, Trash2, X } from 'lucide-react';
import { mediaTypeOf } from '../../shared/media';
import { placementsOf } from '../../shared/stats';
import { GROUP_BOARD, POOL, type AnimeMeta, type Review } from '../../shared/types';
import { formatLabel, genreLabel, seasonLabel, sourceLabel, statusLabel, type AnimeDetails } from '../lib/anime-api';
import { titleDetails } from '../lib/catalog';
import { RECOMMEND, WATCH_STATUS, formatRating, plural, ratingColor, readableOn, timeAgo } from '../lib/format';
import { agree, mediaNoun, thisOne } from '../lib/words';
import { ReviewEditor } from './ReviewEditor';
import { useRoom } from './RoomContext';
import { useToast } from './Toasts';
import { Avatar, Button, Chip, Modal, Spinner, cn } from './ui';

export function AnimeDialog({ target, onClose }: { target: { key: string; meta: AnimeMeta } | null; onClose: () => void }) {
  const { client } = useRoom();
  const open = !!target;

  useEffect(() => {
    if (!target) return;
    client.setPresence({ viewing: target.key });
    return () => client.setPresence({ viewing: null });
  }, [client, target]);

  return (
    <Modal open={open} onClose={onClose} label={target?.meta.title ?? 'Detalhes'} className="max-w-3xl overflow-hidden">
      {target && <AnimeDialogBody key={target.key} target={target} onClose={onClose} />}
    </Modal>
  );
}

function AnimeDialogBody({ target, onClose }: { target: { key: string; meta: AnimeMeta }; onClose: () => void }) {
  const { room, me, board, dispatch, titleOf, inRoom, openAnime, snap, summaries, member, memberName, place } = useRoom();
  const toast = useToast();
  const roomKey = inRoom(target.meta);
  const meta: AnimeMeta = (roomKey && room.anime[roomKey]) || target.meta;
  const [details, setDetails] = useState<AnimeDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [fullSynopsis, setFullSynopsis] = useState(false);

  const media = mediaTypeOf(meta.key);
  const noun = mediaNoun(media);

  useEffect(() => {
    let alive = true;
    setLoadingDetails(true);
    titleDetails(meta)
      .then((d) => alive && setDetails(d))
      .catch(() => {})
      .finally(() => alive && setLoadingDetails(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.key]);

  const title = titleOf(meta);
  const altTitle = title === meta.title ? (meta.titleEnglish ?? meta.titleNative) : meta.title;
  const synopsis = details?.synopsis || meta.synopsis;
  const banner = details?.meta.banner ?? meta.banner;
  const cover = details?.coverLarge ?? meta.cover;

  const summary = roomKey ? summaries[roomKey] : undefined;
  const reviews: [string, Review][] = roomKey
    ? Object.entries(room.reviews[roomKey] ?? {}).filter(([uid]) => uid !== me && room.members[uid])
    : [];
  reviews.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const placements = roomKey ? placementsOf(room, roomKey) : {};
  const typing = Object.values(snap.presence).filter((p) => p.typing === roomKey && room.members[p.userId]);
  const watching = Object.values(snap.presence).filter((p) => p.viewing === roomKey && room.members[p.userId]);

  // Viewing someone else's tier list (or the average)? The quick mover acts on your own.
  const editableBoard = board === GROUP_BOARD || board === me ? board : me;
  const currentTier = roomKey ? (placements[editableBoard] ?? null) : null;

  const add = () => {
    // The details (when loaded) know more: status, episodes, network or director…
    const anime = details?.meta.key === meta.key ? details.meta : meta;
    if (dispatch({ type: 'anime.add', anime })) toast(`«${title}» ${agree('adicionad', noun)} ${place.to}.`, 'success');
  };

  const info = details?.meta.key === meta.key ? { ...meta, ...details.meta } : meta;
  const years = info.year && details?.endYear && details.endYear !== info.year ? `${info.year}–${details.endYear}` : info.year;
  const chips = (
    media === 'anime'
      ? [
          formatLabel(info.format),
          info.season && info.year ? `${seasonLabel(info.season)} ${info.year}` : info.year,
          info.episodes ? `${info.episodes} episódios` : null,
          details?.duration ? `${details.duration} min/ep.` : null,
          statusLabel(info.status),
          info.studio,
          sourceLabel(details?.source ?? null) ? `Origem: ${sourceLabel(details?.source ?? null)}` : null,
        ]
      : media === 'tv'
        ? [
            formatLabel(info.format),
            years,
            details?.seasons ? plural(details.seasons, 'temporada', 'temporadas') : null,
            info.episodes ? plural(info.episodes, 'episódio', 'episódios') : null,
            details?.duration ? `${details.duration} min/ep.` : null,
            statusLabel(info.status, 'tv'),
            info.studio,
          ]
        : [
            formatLabel(info.format),
            info.year,
            details?.duration ? runtime(details.duration) : null,
            statusLabel(info.status, 'movie'),
            info.studio ? `Realização: ${info.studio}` : null,
          ]
  ).filter(Boolean) as (string | number)[];
  const people = [
    details?.creators?.length ? `Criada por ${details.creators.join(', ')}` : null,
    details?.cast?.length ? `Com ${details.cast.join(', ')}` : null,
  ].filter(Boolean) as string[];
  const scoreSource = meta.source === 'jikan' ? 'MAL' : meta.source === 'tmdb' ? 'TMDB' : 'AniList';
  const siteName = meta.source === 'jikan' ? 'MyAnimeList' : meta.source === 'tmdb' ? 'TMDB' : 'AniList';

  return (
    <div className="max-h-[calc(100dvh-3rem)] overflow-y-auto">
      {/* Header */}
      <div className="relative">
        <div
          className="h-36 w-full bg-cover bg-center sm:h-44"
          style={{
            backgroundImage: banner ? `url(${banner})` : undefined,
            backgroundColor: meta.color ?? '#1f1f2f',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-surface/60 to-surface" />
        <Button
          variant="subtle"
          size="icon-sm"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 bg-black/50 backdrop-blur hover:bg-black/70"
        >
          <X size={18} />
        </Button>
        <div className="relative -mt-24 flex gap-4 px-5 sm:-mt-28">
          <img
            src={cover}
            alt=""
            className="h-40 w-28 shrink-0 rounded-xl object-cover shadow-2xl ring-1 ring-white/10 sm:h-48 sm:w-32"
          />
          <div className="min-w-0 flex-1 self-end pb-1">
            <h2 className="text-xl leading-tight font-extrabold sm:text-2xl">{title}</h2>
            {altTitle && altTitle !== title && <p className="mt-0.5 truncate text-sm text-muted">{altTitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {meta.score != null && (
                <Chip color="#8b5cf6">
                  ★ {meta.score}% no {scoreSource}
                </Chip>
              )}
              {summary?.avg != null && (
                <Chip color={ratingColor(summary.avg)}>
                  {formatRating(Math.round(summary.avg * 10) / 10)}/10 {place.in} ({summary.count})
                </Chip>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 pt-4 pb-6">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted">
          {chips.map((c) => (
            <span key={String(c)} className="rounded-md bg-surface-3 px-2 py-1">
              {c}
            </span>
          ))}
          {details?.nextEpisode && (
            <span className="rounded-md bg-accent/15 px-2 py-1 text-violet-200">
              Ep. {details.nextEpisode.episode} {timeAgo(details.nextEpisode.airingAt * 1000)}
            </span>
          )}
        </div>

        {!roomKey && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
            <p className="flex-1 text-sm">
              {thisOne(noun)} {noun.one} ainda não está {place.in}.
            </p>
            <Button variant="primary" onClick={add}>
              <Plus size={16} /> Adicionar {place.to}
            </Button>
          </div>
        )}

        {roomKey && (watching.length > 0 || typing.length > 0) && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {watching.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="flex -space-x-1.5">
                  {watching.map((p) => (
                    <Avatar key={p.userId} member={room.members[p.userId]} size={20} />
                  ))}
                </span>
                {watching.length === 1 ? `${room.members[watching[0].userId].name} também está a ver` : 'também estão a ver'}
              </span>
            )}
            {typing.map((p) => (
              <span key={p.userId} className="animate-pulse" style={{ color: room.members[p.userId].color }}>
                ✍️ {room.members[p.userId].name} está a escrever uma opinião…
              </span>
            ))}
          </div>
        )}

        {roomKey && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Onde está nas tierlists</h3>
            <div className="mb-3">
                <p className="mb-1.5 text-xs text-muted">
                  Mover na tierlist {editableBoard === GROUP_BOARD ? 'do Grupo' : 'tua'}:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {room.tiers.map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        currentTier !== t.id &&
                        dispatch({
                          type: 'board.move',
                          board: editableBoard,
                          key: roomKey,
                          to: t.id,
                          index: room.boards[editableBoard]?.[t.id]?.length ?? 0,
                        })
                      }
                      className={cn(
                        'h-9 min-w-10 rounded-lg px-2.5 text-sm font-black transition',
                        currentTier === t.id ? 'ring-2 ring-white ring-offset-2 ring-offset-surface' : 'opacity-60 hover:opacity-100',
                      )}
                      style={{ background: t.color, color: readableOn(t.color) }}
                      aria-pressed={currentTier === t.id}
                    >
                      {t.label}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      currentTier && dispatch({ type: 'board.move', board: editableBoard, key: roomKey, to: POOL, index: 0 })
                    }
                    className={cn(
                      'h-9 rounded-lg border px-2.5 text-sm font-medium',
                      !currentTier ? 'border-accent bg-accent/15' : 'border-line text-muted hover:text-fg',
                    )}
                  >
                    Por classificar
                  </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[GROUP_BOARD, ...Object.keys(room.members)].map((b) => {
                const tierId = placements[b];
                if (!tierId) return null;
                const tier = room.tiers.find((t) => t.id === tierId);
                if (!tier) return null;
                const m = b === GROUP_BOARD ? null : member(b);
                return (
                  <span key={b} className="flex items-center gap-1.5 rounded-full bg-surface-3 py-0.5 pr-1 pl-2 text-xs">
                    {m ? <Avatar member={m} size={16} /> : '👥'}
                    {b === GROUP_BOARD ? 'Grupo' : memberName(b)}
                    <span
                      className="rounded-full px-1.5 text-[11px] font-black"
                      style={{ background: tier.color, color: readableOn(tier.color) }}
                    >
                      {tier.label}
                    </span>
                  </span>
                );
              })}
              {Object.keys(placements).length === 0 && (
                <p className="text-xs text-faint">Ainda ninguém {noun.f ? 'a' : 'o'} pôs num tier.</p>
              )}
            </div>
          </section>
        )}

        {(synopsis || loadingDetails) && (
          <section>
            <h3 className="mb-1.5 text-sm font-semibold">Sinopse</h3>
            {synopsis ? (
              <>
                <p className={cn('text-sm leading-relaxed whitespace-pre-line text-muted', !fullSynopsis && 'line-clamp-5')}>
                  {synopsis}
                </p>
                {synopsis.length > 320 && (
                  <button className="mt-1 text-xs font-medium text-accent hover:underline" onClick={() => setFullSynopsis((v) => !v)}>
                    {fullSynopsis ? 'Ver menos' : 'Ver mais'}
                  </button>
                )}
              </>
            ) : (
              <Spinner size={16} className="text-muted" />
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {meta.genres.map((g) => (
                <Chip key={g} className="bg-surface-3 text-muted">
                  {genreLabel(g)}
                </Chip>
              ))}
              {details?.tags.map((t) => (
                <Chip key={t} className="border border-line text-faint">
                  {t}
                </Chip>
              ))}
            </div>
            {people.map((p) => (
              <p key={p} className="mt-2 text-xs text-muted">
                {p}
              </p>
            ))}
          </section>
        )}

        {roomKey && (
          <section>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold">Opiniões {place.from}</h3>
              {summary && summary.reviewers > 0 && (
                <p className="text-xs text-muted">
                  {summary.avg != null && (
                    <span className="font-semibold" style={{ color: ratingColor(summary.avg) }}>
                      {formatRating(Math.round(summary.avg * 10) / 10)}/10
                    </span>
                  )}
                  {summary.avg != null && ' · '}
                  {RECOMMEND.yes.emoji} {summary.yes} · {RECOMMEND.maybe.emoji} {summary.maybe} · {RECOMMEND.no.emoji} {summary.no}
                </p>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="text-sm text-faint">
                {room.reviews[roomKey]?.[me] ? 'Ainda nenhum colega deu a opinião.' : 'Ainda ninguém deu a sua opinião. Sê o primeiro!'}
              </p>
            ) : (
              <ul className="space-y-2">
                {reviews.map(([uid, r]) => (
                  <ReviewItem key={uid} userId={uid} review={r} />
                ))}
              </ul>
            )}
          </section>
        )}

        {roomKey && (
          <section className="rounded-xl border border-line bg-surface-2/60 p-4">
            <h3 className="mb-3 text-sm font-semibold">A tua avaliação</h3>
            <ReviewEditor animeKey={roomKey} />
          </section>
        )}

        {!!details?.recommendations.length && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Quem gostou disto também viu</h3>
            <div className="flex gap-2.5 overflow-x-auto pb-2">
              {details.recommendations.map((r) => {
                const here = inRoom(r);
                return (
                  <button key={r.key} className="w-24 shrink-0 text-left" onClick={() => openAnime(r)} title={titleOf(r)}>
                    <div className="relative">
                      <img src={r.cover} alt="" loading="lazy" className="aspect-[2/3] w-full rounded-lg object-cover" />
                      {here && (
                        <span className="absolute right-1 bottom-1 rounded bg-ok px-1 text-[10px] font-bold text-black">
                          {place.in}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-tight">{titleOf(r)}</p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {meta.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-sm font-medium hover:bg-white/10"
            >
              <ExternalLink size={14} /> {siteName}
            </a>
          )}
          {details?.trailerUrl && (
            <a
              href={details.trailerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/5 px-3 text-sm font-medium hover:bg-white/10"
            >
              <Play size={14} /> Trailer
            </a>
          )}
          {/* In the community space only whoever added a title can take it out. */}
          {roomKey && (!room.global || room.anime[roomKey]?.addedBy === me) && (
            <Button
              size="sm"
              variant="danger"
              className="ml-auto"
              onClick={() => {
                if (!confirm(`Remover «${title}» ${place.from}? Sai de todas as tierlists (as opiniões ficam guardadas).`)) return;
                if (dispatch({ type: 'anime.remove', key: roomKey })) {
                  toast(`«${title}» ${agree('removid', noun)} ${place.from}.`);
                  onClose();
                }
              }}
            >
              <Trash2 size={14} /> Remover {place.from}
            </Button>
          )}
          {roomKey && room.anime[roomKey] && (
            <p className="w-full text-[11px] text-faint">
              Adicionado por {memberName(room.anime[roomKey].addedBy)} {timeAgo(room.anime[roomKey].addedAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewItem({ userId, review }: { userId: string; review: Review }) {
  const { room, isOnline } = useRoom();
  const m = room.members[userId];
  return (
    <li className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Avatar member={m} size={26} online={isOnline(userId)} />
        <span className="text-sm font-semibold">{m.name}</span>
        {review.rating != null && (
          <span
            className="rounded-md px-1.5 py-0.5 text-xs font-bold text-black"
            style={{ background: ratingColor(review.rating) }}
          >
            {review.rating}/10
          </span>
        )}
        {review.recommend && (
          <Chip color={RECOMMEND[review.recommend].color}>
            {RECOMMEND[review.recommend].emoji} {RECOMMEND[review.recommend].short}
          </Chip>
        )}
        {review.status && (
          <Chip className="bg-surface-3 text-muted">
            {WATCH_STATUS[review.status].emoji} {WATCH_STATUS[review.status].label}
          </Chip>
        )}
        <span className="ml-auto text-[11px] text-faint">{timeAgo(review.updatedAt)}</span>
      </div>
      {review.opinion.trim() && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{review.opinion}</p>}
    </li>
  );
}

/** "2 h 49 min" */
function runtime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
