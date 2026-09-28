// Derived data (pure functions) used by the UI: averages, the consensus tier list, affinity...
import { GROUP_BOARD, type Board, type RoomState } from './types';

export interface ReviewSummary {
  avg: number | null;
  count: number;
  ratings: number[];
  yes: number;
  maybe: number;
  no: number;
  /** standard deviation of the ratings (null with < 2 ratings) */
  spread: number | null;
  reviewers: number;
}

export function summarize(state: RoomState, key: string): ReviewSummary {
  const reviews = state.reviews[key] ?? {};
  const ratings: number[] = [];
  let yes = 0;
  let maybe = 0;
  let no = 0;
  let reviewers = 0;
  for (const [userId, r] of Object.entries(reviews)) {
    if (!state.members[userId]) continue;
    reviewers++;
    if (r.rating != null) ratings.push(r.rating);
    if (r.recommend === 'yes') yes++;
    else if (r.recommend === 'maybe') maybe++;
    else if (r.recommend === 'no') no++;
  }
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  let spread: number | null = null;
  if (avg != null && ratings.length >= 2) {
    spread = Math.sqrt(ratings.reduce((acc, r) => acc + (r - avg) ** 2, 0) / ratings.length);
  }
  return { avg, count: ratings.length, ratings, yes, maybe, no, spread, reviewers };
}

export function summarizeAll(state: RoomState): Record<string, ReviewSummary> {
  const out: Record<string, ReviewSummary> = {};
  for (const key of Object.keys(state.anime)) out[key] = summarize(state, key);
  return out;
}

/** Anime keys that are not placed in any tier of `board` (newest first). */
export function poolOf(state: RoomState, board: Board | undefined): string[] {
  const placed = new Set<string>();
  if (board) for (const t of state.tiers) for (const k of board[t.id] ?? []) placed.add(k);
  return Object.values(state.anime)
    .filter((a) => !placed.has(a.key))
    .sort((a, b) => b.addedAt - a.addedAt || a.key.localeCompare(b.key))
    .map((a) => a.key);
}

/** Board lists with only anime that still exist, for every current tier. */
export function normalizedBoard(state: RoomState, boardId: string): Board {
  const src = state.boards[boardId];
  const out: Board = {};
  for (const t of state.tiers) out[t.id] = (src?.[t.id] ?? []).filter((k) => state.anime[k]);
  return out;
}

export interface ConsensusBoard {
  board: Board;
  /** how many members placed each anime */
  votes: Record<string, number>;
  /** average tier index (0 = best) */
  avgIndex: Record<string, number>;
}

/**
 * The "average" tier list: every member's personal tier list counts as a vote and each
 * anime lands in the tier closest to the average position.
 */
export function consensusBoard(state: RoomState): ConsensusBoard {
  const tierIndex = new Map(state.tiers.map((t, i) => [t.id, i]));
  const sums: Record<string, number> = {};
  const votes: Record<string, number> = {};
  for (const memberId of Object.keys(state.members)) {
    const b = state.boards[memberId];
    if (!b) continue;
    for (const t of state.tiers) {
      for (const k of b[t.id] ?? []) {
        if (!state.anime[k]) continue;
        sums[k] = (sums[k] ?? 0) + (tierIndex.get(t.id) ?? 0);
        votes[k] = (votes[k] ?? 0) + 1;
      }
    }
  }
  const avgIndex: Record<string, number> = {};
  for (const k of Object.keys(votes)) avgIndex[k] = sums[k] / votes[k];

  const board: Board = {};
  for (const t of state.tiers) board[t.id] = [];
  const keys = Object.keys(avgIndex).sort((a, b) => avgIndex[a] - avgIndex[b] || votes[b] - votes[a] || a.localeCompare(b));
  for (const k of keys) {
    const idx = Math.min(state.tiers.length - 1, Math.max(0, Math.round(avgIndex[k])));
    board[state.tiers[idx].id].push(k);
  }
  return { board, votes, avgIndex };
}

export interface Affinity {
  /** 0..100, null when there are fewer than 2 anime rated by both */
  score: number | null;
  common: number;
}

/** Taste compatibility between two members, from the anime both rated. */
export function affinity(state: RoomState, a: string, b: string): Affinity {
  let common = 0;
  let diff = 0;
  for (const byUser of Object.values(state.reviews)) {
    const ra = byUser[a]?.rating;
    const rb = byUser[b]?.rating;
    if (ra == null || rb == null) continue;
    common++;
    diff += Math.abs(ra - rb);
  }
  if (common < 2) return { score: null, common };
  return { score: Math.round(100 - (diff / common / 9) * 100), common };
}

export interface MemberStats {
  rated: number;
  avg: number | null;
  recommended: number;
  opinions: number;
  placed: number;
  favourites: string[];
  topGenres: string[];
}

export function memberStats(state: RoomState, userId: string): MemberStats {
  const rated: { key: string; rating: number }[] = [];
  let recommended = 0;
  let opinions = 0;
  const genreScore: Record<string, number> = {};
  for (const [key, byUser] of Object.entries(state.reviews)) {
    const r = byUser[userId];
    if (!r || !state.anime[key]) continue;
    if (r.rating != null) {
      rated.push({ key, rating: r.rating });
      if (r.rating >= 8) for (const g of state.anime[key].genres) genreScore[g] = (genreScore[g] ?? 0) + r.rating - 7;
    }
    if (r.recommend === 'yes') recommended++;
    if (r.opinion.trim()) opinions++;
  }
  const b = state.boards[userId];
  let placed = 0;
  if (b) for (const t of state.tiers) placed += (b[t.id] ?? []).filter((k) => state.anime[k]).length;
  const avg = rated.length ? rated.reduce((acc, r) => acc + r.rating, 0) / rated.length : null;
  const favourites = rated
    .sort((x, y) => y.rating - x.rating || x.key.localeCompare(y.key))
    .slice(0, 3)
    .map((r) => r.key);
  const topGenres = Object.entries(genreScore)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([g]) => g);
  return { rated: rated.length, avg, recommended, opinions, placed, favourites, topGenres };
}

/**
 * Anime recommended by other members that `userId` has not reviewed yet (or marked as "plan to watch").
 */
export function recommendationsFor(state: RoomState, userId: string): { key: string; by: string[]; avg: number | null }[] {
  const out: { key: string; by: string[]; avg: number | null }[] = [];
  for (const key of Object.keys(state.anime)) {
    const byUser = state.reviews[key] ?? {};
    const mine = byUser[userId];
    if (mine && mine.status !== 'plan') continue;
    const by = Object.entries(byUser)
      .filter(([u, r]) => u !== userId && r.recommend === 'yes' && state.members[u])
      .map(([u]) => u);
    if (!by.length) continue;
    out.push({ key, by, avg: summarize(state, key).avg });
  }
  return out.sort((a, b) => b.by.length - a.by.length || (b.avg ?? 0) - (a.avg ?? 0));
}

/** Where each member (and the group) placed an anime: board id -> tier id. */
export function placementsOf(state: RoomState, key: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const boardId of [GROUP_BOARD, ...Object.keys(state.members)]) {
    const b = state.boards[boardId];
    if (!b) continue;
    for (const t of state.tiers) {
      if (b[t.id]?.includes(key)) {
        out[boardId] = t.id;
        break;
      }
    }
  }
  return out;
}

