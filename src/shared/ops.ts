// The single source of truth for how the room state changes.
//
// `applyOp` is a deterministic reducer used by BOTH the server (on its authoritative
// copy) and the browser (to apply confirmed ops and to show optimistic updates).
// It mutates the given state, so on the client it runs inside Immer's `produce`.
//
// Every case validates everything first and only then mutates, so a rejected op
// (OpError) never leaves the state half-updated.

import { DEFAULT_TIERS, LIMITS } from './constants';
import { acceptsMedia, mediaTypeOf, roomKind } from './media';
import {
  GROUP_BOARD,
  POOL,
  type Activity,
  type Board,
  type Op,
  type OpMeta,
  type Review,
  type ReviewPatch,
  type RoomKind,
  type RoomState,
  type Tier,
} from './types';

export class OpError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'OpError';
  }
}

export function createRoomState(
  id: string,
  name: string,
  at: number,
  createdBy: string | null = null,
  opts: { kind?: RoomKind; listed?: boolean; global?: boolean } = {},
): RoomState {
  const tiers = DEFAULT_TIERS.map((t) => ({ ...t }));
  return {
    id,
    name,
    kind: opts.kind ?? 'anime',
    listed: opts.listed ?? false,
    ...(opts.global ? { global: true } : {}),
    createdAt: at,
    createdBy,
    tiers,
    anime: {},
    boards: { [GROUP_BOARD]: emptyBoard(tiers) },
    reviews: {},
    photos: {},
    members: {},
    chat: [],
    activity: [],
  };
}

/** "Tasca do Zé" and "tasca do ze" are the same name. */
const sameName = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'pt', { sensitivity: 'base' }) === 0;

export function emptyBoard(tiers: Tier[]): Board {
  const b: Board = {};
  for (const t of tiers) b[t.id] = [];
  return b;
}

export function isEmptyReview(r: Pick<Review, 'rating' | 'recommend' | 'status' | 'opinion'>): boolean {
  return r.rating == null && r.recommend == null && r.status == null && r.opinion.trim() === '';
}

function activityId(m: OpMeta): string {
  return m.seq > 0 ? `s${m.seq}` : `p${m.cid ?? m.at}`;
}

function pushActivity(s: RoomState, m: OpMeta, a: Omit<Activity, 'id' | 'at' | 'by'>) {
  s.activity.push({ id: activityId(m), at: m.at, by: m.by, ...a });
  if (s.activity.length > LIMITS.activityHistory) {
    s.activity.splice(0, s.activity.length - LIMITS.activityHistory);
  }
}

/** Removes a recent activity entry that the new one supersedes (e.g. several moves of the same card). */
function dropRecent(s: RoomState, m: OpMeta, windowMs: number, match: (a: Activity) => boolean) {
  const start = Math.max(0, s.activity.length - 15);
  for (let i = s.activity.length - 1; i >= start; i--) {
    const a = s.activity[i];
    if (m.at - a.at > windowMs) return;
    if (a.by === m.by && match(a)) {
      s.activity.splice(i, 1);
      return;
    }
  }
}

function assertBoard(s: RoomState, board: string) {
  if (board !== GROUP_BOARD && !s.members[board]) throw new OpError('board_not_found');
}

function assertTier(s: RoomState, to: string) {
  if (to !== POOL && !s.tiers.some((t) => t.id === to)) throw new OpError('tier_not_found');
}

function ensureBoard(s: RoomState, board: string): Board {
  let b = s.boards[board];
  if (!b) {
    b = emptyBoard(s.tiers);
    s.boards[board] = b;
  }
  for (const t of s.tiers) if (!b[t.id]) b[t.id] = [];
  return b;
}

/** Tier id that holds `key` on `board`, or null when it is in the pool. */
export function tierOf(s: RoomState, board: string, key: string): string | null {
  const b = s.boards[board];
  if (!b) return null;
  for (const t of s.tiers) if (b[t.id]?.includes(key)) return t.id;
  return null;
}

function normalizePatch(patch: ReviewPatch): ReviewPatch {
  const out: ReviewPatch = {};
  if ('rating' in patch) {
    const r = patch.rating;
    if (r == null) out.rating = null;
    else if (Number.isInteger(r) && r >= 1 && r <= 10) out.rating = r;
    else throw new OpError('invalid_rating');
  }
  if ('recommend' in patch) out.recommend = patch.recommend ?? null;
  if ('status' in patch) out.status = patch.status ?? null;
  if ('opinion' in patch) out.opinion = (patch.opinion ?? '').slice(0, LIMITS.opinion);
  return out;
}

export function applyOp(s: RoomState, op: Op, m: OpMeta): void {
  switch (op.type) {
    case 'anime.add': {
      const a = op.anime;
      const place = op.place;
      // A series room only takes series, a movies room only movies…
      if (!acceptsMedia(roomKind(s), mediaTypeOf(a.key))) throw new OpError('media_not_allowed');
      if (place) {
        assertBoard(s, place.board);
        assertTier(s, place.to);
      }
      if (s.anime[a.key]) return;
      if (a.idMal != null && Object.values(s.anime).some((x) => x.idMal === a.idMal)) return;
      // Restaurants and places added by hand: the same name in the same town is the same place.
      if (a.source === 'user') {
        const city = a.place?.city ?? '';
        const twin = Object.values(s.anime).some(
          (x) => mediaTypeOf(x.key) === mediaTypeOf(a.key) && sameName(x.title, a.title) && sameName(x.place?.city ?? '', city),
        );
        if (twin) throw new OpError('already_in_room');
      }
      if (Object.keys(s.anime).length >= (s.global ? LIMITS.maxGlobalAnime : LIMITS.maxAnime)) throw new OpError('limit_anime');

      s.anime[a.key] = { ...a, genres: [...a.genres], addedBy: m.by, addedAt: m.at };
      let toLabel: string | undefined;
      if (place && place.to !== POOL) {
        ensureBoard(s, place.board)[place.to].push(a.key);
        toLabel = s.tiers.find((t) => t.id === place.to)?.label;
      }
      pushActivity(s, m, { kind: 'add', key: a.key, board: place?.board, to: place?.to, toLabel });
      return;
    }

    case 'anime.remove': {
      const anime = s.anime[op.key];
      if (!anime) return;
      delete s.anime[op.key];
      for (const b of Object.values(s.boards)) {
        for (const tid of Object.keys(b)) {
          const i = b[tid].indexOf(op.key);
          if (i >= 0) b[tid].splice(i, 1);
        }
      }
      // Reviews are kept on purpose: if the anime is added again, the opinions come back. Photos
      // take space, so they go (the server deletes the images).
      if (s.photos) delete s.photos[op.key];
      pushActivity(s, m, { kind: 'remove', key: op.key, text: anime.title });
      return;
    }

    case 'photo.add': {
      if (!s.anime[op.key]) throw new OpError('anime_not_found');
      const photos = (s.photos ??= {});
      const list = photos[op.key] ?? [];
      if (list.some((p) => p.id === op.photo.id)) return;
      if (list.filter((p) => p.by === m.by).length >= LIMITS.photosPerMember) throw new OpError('limit_photos_title');
      const total = Object.values(photos).reduce((n, l) => n + l.length, 0);
      if (total >= (s.global ? LIMITS.maxGlobalPhotos : LIMITS.maxPhotos)) throw new OpError('limit_photos');
      photos[op.key] = [...list, { id: op.photo.id, by: m.by, at: m.at, w: op.photo.w, h: op.photo.h }];
      // Several photos in a row are one entry: "added 3 photos to X".
      const last = s.activity.at(-1);
      if (last && last.kind === 'photo' && last.by === m.by && last.key === op.key && m.at - last.at < 10 * 60_000) {
        last.count = (last.count ?? 1) + 1;
        last.at = m.at;
        return;
      }
      pushActivity(s, m, { kind: 'photo', key: op.key, count: 1 });
      return;
    }

    case 'photo.remove': {
      const list = s.photos?.[op.key];
      if (!list?.some((p) => p.id === op.id)) return;
      const rest = list.filter((p) => p.id !== op.id);
      if (rest.length) s.photos![op.key] = rest;
      else delete s.photos![op.key];
      return;
    }

    case 'board.move': {
      const { board, key, to } = op;
      if (!s.anime[key]) throw new OpError('anime_not_found');
      assertBoard(s, board);
      assertTier(s, to);

      const b = ensureBoard(s, board);
      let from: string | null = null;
      for (const t of s.tiers) {
        const list = b[t.id];
        for (let i = list.indexOf(key); i >= 0; i = list.indexOf(key)) {
          list.splice(i, 1);
          from ??= t.id;
        }
      }
      if (to !== POOL) {
        const list = b[to];
        const index = Math.max(0, Math.min(Number.isFinite(op.index) ? Math.trunc(op.index) : list.length, list.length));
        list.splice(index, 0, key);
      }
      if ((from ?? POOL) !== to) {
        dropRecent(s, m, 60_000, (a) => a.kind === 'move' && a.key === key && a.board === board);
        const toLabel = to === POOL ? undefined : s.tiers.find((t) => t.id === to)?.label;
        pushActivity(s, m, { kind: 'move', key, board, to, toLabel });
      }
      return;
    }

    case 'board.copy': {
      assertBoard(s, op.board);
      if (op.from !== GROUP_BOARD && !s.members[op.from]) throw new OpError('board_not_found');
      if (op.board === op.from) return;
      const src = s.boards[op.from];
      const copy: Board = {};
      for (const t of s.tiers) copy[t.id] = (src?.[t.id] ?? []).filter((k) => s.anime[k]);
      s.boards[op.board] = copy;
      pushActivity(s, m, { kind: 'copy', board: op.board, to: op.from });
      return;
    }

    case 'board.clear': {
      assertBoard(s, op.board);
      s.boards[op.board] = emptyBoard(s.tiers);
      pushActivity(s, m, { kind: 'clear', board: op.board });
      return;
    }

    case 'review.set': {
      if (!s.anime[op.key]) throw new OpError('anime_not_found');
      const patch = normalizePatch(op.patch);
      const prev = s.reviews[op.key]?.[m.by];
      const next: Review = {
        rating: prev?.rating ?? null,
        recommend: prev?.recommend ?? null,
        status: prev?.status ?? null,
        opinion: prev?.opinion ?? '',
        ...patch,
        updatedAt: m.at,
      };
      if (isEmptyReview(next)) {
        if (prev) {
          delete s.reviews[op.key][m.by];
          if (Object.keys(s.reviews[op.key]).length === 0) delete s.reviews[op.key];
        }
        dropRecent(s, m, 10 * 60_000, (a) => a.kind === 'review' && a.key === op.key);
        return;
      }
      (s.reviews[op.key] ??= {})[m.by] = next;
      dropRecent(s, m, 10 * 60_000, (a) => a.kind === 'review' && a.key === op.key);
      pushActivity(s, m, {
        kind: 'review',
        key: op.key,
        rating: next.rating,
        recommend: next.recommend,
        status: next.status,
        opinion: next.opinion.trim() !== '',
      });
      return;
    }

    case 'tiers.set': {
      const tiers = op.tiers;
      if (tiers.length < 1 || tiers.length > LIMITS.maxTiers) throw new OpError('invalid_tiers');
      const ids = new Set<string>();
      for (const t of tiers) {
        if (!t.id || t.id === POOL || ids.has(t.id)) throw new OpError('invalid_tiers');
        if (!t.label.trim()) throw new OpError('invalid_tiers');
        ids.add(t.id);
      }
      s.tiers = tiers.map((t) => ({ id: t.id, label: t.label.trim().slice(0, LIMITS.tierLabel), color: t.color }));
      for (const b of Object.values(s.boards)) {
        for (const tid of Object.keys(b)) if (!ids.has(tid)) delete b[tid];
        for (const t of s.tiers) if (!b[t.id]) b[t.id] = [];
      }
      dropRecent(s, m, 5 * 60_000, (a) => a.kind === 'tiers');
      pushActivity(s, m, { kind: 'tiers' });
      return;
    }

    case 'room.rename': {
      const name = op.name.trim().slice(0, LIMITS.roomName);
      if (!name) throw new OpError('invalid_name');
      if (name === s.name) return;
      s.name = name;
      dropRecent(s, m, 5 * 60_000, (a) => a.kind === 'rename');
      pushActivity(s, m, { kind: 'rename', text: name });
      return;
    }

    case 'room.kind': {
      if (roomKind(s) === op.kind) return;
      // An anime room can become "Tudo", but a room with anime cannot become a films room.
      if (Object.keys(s.anime).some((k) => !acceptsMedia(op.kind, mediaTypeOf(k)))) throw new OpError('kind_conflict');
      s.kind = op.kind;
      pushActivity(s, m, { kind: 'kind', text: op.kind });
      return;
    }

    case 'room.listed': {
      if (!!s.listed === op.listed) return;
      s.listed = op.listed;
      pushActivity(s, m, { kind: 'listed', listed: op.listed });
      return;
    }

    case 'room.owner': {
      if (!s.members[op.to]) throw new OpError('not_member');
      if (s.createdBy === op.to) return;
      s.createdBy = op.to;
      pushActivity(s, m, { kind: 'owner', to: op.to });
      return;
    }

    case 'member.join': {
      const { id, name, color, avatar } = op.member;
      const unit = op.member.unit ?? '';
      const existing = s.members[id];
      if (existing) {
        existing.name = name;
        existing.color = color;
        existing.avatar = avatar;
        existing.unit = unit;
        return;
      }
      if (Object.keys(s.members).length >= (s.global ? LIMITS.maxGlobalMembers : LIMITS.maxMembers)) {
        throw new OpError('limit_members');
      }
      s.members[id] = { id, name, color, avatar, unit, joinedAt: m.at };
      // The first member owns a room; the community space belongs to everyone.
      if (!s.global) s.createdBy ??= id;
      pushActivity(s, m, { kind: 'join' });
      return;
    }

    case 'member.update': {
      const me = s.members[m.by];
      if (!me) throw new OpError('not_member');
      me.name = op.name;
      me.color = op.color;
      me.avatar = op.avatar;
      me.unit = op.unit ?? '';
      return;
    }

    case 'chat.send': {
      const text = op.text.trim().slice(0, LIMITS.chatText);
      if (!text) throw new OpError('empty_message');
      for (let i = s.chat.length - 1; i >= Math.max(0, s.chat.length - 50); i--) {
        if (s.chat[i].id === op.id) return;
      }
      s.chat.push({ id: op.id, by: m.by, at: m.at, text });
      if (s.chat.length > LIMITS.chatHistory) s.chat.splice(0, s.chat.length - LIMITS.chatHistory);
      return;
    }

    default: {
      const never: never = op;
      throw new OpError(`unknown_op:${(never as { type: string }).type}`);
    }
  }
}
