import { describe, expect, it } from 'vitest';
import { applyOp, createRoomState } from '../src/shared/ops';
import {
  affinity,
  consensusBoard,
  memberStats,
  placementsOf,
  poolOf,
  recommendationsFor,
  summarize,
} from '../src/shared/stats';
import { animeMetaSchema, clientOpSchema, joinSchema } from '../src/shared/schema';
import { GROUP_BOARD, type Op, type RoomState } from '../src/shared/types';
import { anime } from './fixtures';

let seq = 0;
function setup(): RoomState {
  const s = createRoomState('room01', 'Turma', 0);
  for (const [id, name] of [
    ['ana', 'Ana'],
    ['rui', 'Rui'],
    ['eva', 'Eva'],
  ]) {
    applyOp(s, { type: 'member.join', member: { id, name, color: '#ff0000', avatar: '' } }, { by: id, at: 1, seq: ++seq });
  }
  for (const id of [1, 2, 3, 4]) applyOp(s, { type: 'anime.add', anime: anime(id) }, { by: 'ana', at: 10 + id, seq: ++seq });
  return s;
}
const run = (s: RoomState, by: string, op: Op) => applyOp(s, op, { by, at: 100, seq: ++seq });
const rate = (s: RoomState, by: string, id: number, rating: number) =>
  run(s, by, { type: 'review.set', key: `al:${id}`, patch: { rating } });

describe('summaries', () => {
  it('computes average, counts and spread', () => {
    const s = setup();
    rate(s, 'ana', 1, 10);
    rate(s, 'rui', 1, 6);
    run(s, 'eva', { type: 'review.set', key: 'al:1', patch: { recommend: 'yes' } });
    run(s, 'rui', { type: 'review.set', key: 'al:1', patch: { recommend: 'no' } });
    const sum = summarize(s, 'al:1');
    expect(sum.avg).toBe(8);
    expect(sum.count).toBe(2);
    expect(sum.yes).toBe(1);
    expect(sum.no).toBe(1);
    expect(sum.spread).toBe(2);
    expect(sum.reviewers).toBe(3);
  });
});

describe('pool and placements', () => {
  it('lists unplaced anime newest first', () => {
    const s = setup();
    run(s, 'ana', { type: 'board.move', board: GROUP_BOARD, key: 'al:3', to: 's', index: 0 });
    expect(poolOf(s, s.boards[GROUP_BOARD])).toEqual(['al:4', 'al:2', 'al:1']);
    expect(poolOf(s, undefined)).toHaveLength(4);
    run(s, 'rui', { type: 'board.move', board: 'rui', key: 'al:3', to: 'b', index: 0 });
    expect(placementsOf(s, 'al:3')).toEqual({ group: 's', rui: 'b' });
  });
});

describe('consensus board', () => {
  it('places each anime at the average tier of the personal tier lists', () => {
    const s = setup();
    // al:1 -> S (0) and B (2) => avg 1 => A
    run(s, 'ana', { type: 'board.move', board: 'ana', key: 'al:1', to: 's', index: 0 });
    run(s, 'rui', { type: 'board.move', board: 'rui', key: 'al:1', to: 'b', index: 0 });
    // al:2 -> F only
    run(s, 'eva', { type: 'board.move', board: 'eva', key: 'al:2', to: 'f', index: 0 });
    // group board does not count
    run(s, 'eva', { type: 'board.move', board: GROUP_BOARD, key: 'al:3', to: 's', index: 0 });
    const c = consensusBoard(s);
    expect(c.board.a).toEqual(['al:1']);
    expect(c.board.f).toEqual(['al:2']);
    expect(c.votes).toEqual({ 'al:1': 2, 'al:2': 1 });
    expect(Object.values(c.board).flat()).not.toContain('al:3');
  });
});

describe('affinity and member stats', () => {
  it('needs at least two common ratings', () => {
    const s = setup();
    rate(s, 'ana', 1, 9);
    rate(s, 'rui', 1, 9);
    expect(affinity(s, 'ana', 'rui')).toEqual({ score: null, common: 1 });
    rate(s, 'ana', 2, 10);
    rate(s, 'rui', 2, 1);
    // diffs 0 and 9 => mean 4.5 => 50%
    expect(affinity(s, 'ana', 'rui')).toEqual({ score: 50, common: 2 });
  });

  it('computes member stats and recommendations', () => {
    const s = setup();
    rate(s, 'ana', 1, 9);
    rate(s, 'ana', 2, 7);
    run(s, 'ana', { type: 'review.set', key: 'al:2', patch: { recommend: 'yes', opinion: 'top' } });
    run(s, 'rui', { type: 'review.set', key: 'al:1', patch: { recommend: 'yes' } });
    run(s, 'eva', { type: 'review.set', key: 'al:1', patch: { recommend: 'yes' } });
    const st = memberStats(s, 'ana');
    expect(st).toMatchObject({ rated: 2, avg: 8, recommended: 1, opinions: 1, favourites: ['al:1', 'al:2'] });
    expect(st.topGenres).toEqual(['Action', 'Drama']);
    // Rui has not reviewed al:2, which Ana recommends. al:1 is recommended by Rui himself.
    expect(recommendationsFor(s, 'rui').map((r) => r.key)).toEqual(['al:2']);
    // Ana reviewed both, but nobody else recommended al:2 to her; al:1 was reviewed by her
    expect(recommendationsFor(s, 'ana')).toEqual([]);
  });
});

describe('schemas', () => {
  it('accepts valid anime metadata and fills defaults', () => {
    const parsed = animeMetaSchema.parse({ ...anime(5), titleEnglish: undefined, genres: undefined });
    expect(parsed.titleEnglish).toBeNull();
    expect(parsed.genres).toEqual([]);
  });

  it('rejects images from unknown hosts and mismatched keys', () => {
    expect(animeMetaSchema.safeParse({ ...anime(5), cover: 'https://evil.example/x.png' }).success).toBe(false);
    expect(animeMetaSchema.safeParse({ ...anime(5), cover: 'http://s4.anilist.co/x.png' }).success).toBe(false);
    expect(animeMetaSchema.safeParse({ ...anime(5), key: 'al:6' }).success).toBe(false);
  });

  it('does not accept server-only ops from clients', () => {
    expect(
      clientOpSchema.safeParse({ type: 'member.join', member: { id: 'x', name: 'x', color: '#000000', avatar: '' } }).success,
    ).toBe(false);
    expect(clientOpSchema.safeParse({ type: 'board.move', board: 'group', key: 'al:1', to: 's', index: 0 }).success).toBe(
      true,
    );
  });

  it('validates join payloads', () => {
    const ok = joinSchema.safeParse({
      roomId: 'abc123xy',
      user: { id: 'user_12345', secret: 'x'.repeat(24), name: ' Ana ', color: '#aabbcc', avatar: '🦊' },
    });
    expect(ok.success && ok.data.user.name).toBe('Ana');
    expect(joinSchema.safeParse({ roomId: '../etc', user: {} }).success).toBe(false);
  });
});
