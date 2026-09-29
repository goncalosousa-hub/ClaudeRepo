import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { applyOp, createRoomState, OpError, tierOf } from '../src/shared/ops';
import { LIMITS } from '../src/shared/constants';
import { GROUP_BOARD, POOL, type Op, type OpMeta, type RoomState } from '../src/shared/types';
import { anime, book, spot, title } from './fixtures';

let seq = 0;
const meta = (by = 'ana', at = 1_000): OpMeta => ({ by, at, seq: ++seq });

function room(): RoomState {
  const s = createRoomState('room01', 'Turma', 0);
  applyOp(s, { type: 'member.join', member: { id: 'ana', name: 'Ana', color: '#ff0000', avatar: '🦊' } }, meta('ana'));
  applyOp(s, { type: 'member.join', member: { id: 'rui', name: 'Rui', color: '#00ff00', avatar: '🐼' } }, meta('rui'));
  return s;
}

function apply(s: RoomState, op: Op, by = 'ana', at = 1_000) {
  applyOp(s, op, meta(by, at));
}

describe('anime.add / anime.remove', () => {
  it('adds anime to the room pool, idempotently', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1, 'Frieren') });
    apply(s, { type: 'anime.add', anime: anime(1, 'Frieren') });
    expect(Object.keys(s.anime)).toEqual(['al:1']);
    expect(s.anime['al:1'].addedBy).toBe('ana');
    expect(tierOf(s, GROUP_BOARD, 'al:1')).toBeNull();
    expect(s.activity.filter((a) => a.kind === 'add')).toHaveLength(1);
  });

  it('ignores the same anime coming from another source (same MAL id)', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1, 'Frieren', { idMal: 52991 }) });
    apply(s, {
      type: 'anime.add',
      anime: { ...anime(52991, 'Frieren'), key: 'mal:52991', source: 'jikan', sourceId: 52991, idMal: 52991 },
    });
    expect(Object.keys(s.anime)).toEqual(['al:1']);
  });

  it('can add and place in one op', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(2), place: { board: GROUP_BOARD, to: 's' } });
    expect(s.boards[GROUP_BOARD].s).toEqual(['al:2']);
  });

  it('removes the anime from every board but keeps the reviews', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 'a', index: 0 });
    apply(s, { type: 'board.move', board: 'rui', key: 'al:1', to: 'b', index: 0 }, 'rui');
    apply(s, { type: 'review.set', key: 'al:1', patch: { rating: 9 } }, 'rui');
    apply(s, { type: 'anime.remove', key: 'al:1' });
    expect(s.anime['al:1']).toBeUndefined();
    expect(s.boards[GROUP_BOARD].a).toEqual([]);
    expect(s.boards.rui.b).toEqual([]);
    expect(s.reviews['al:1'].rui.rating).toBe(9);
    // Re-adding brings the opinion back.
    apply(s, { type: 'anime.add', anime: anime(1) });
    expect(s.reviews['al:1'].rui.rating).toBe(9);
  });
});

describe('room kinds', () => {
  const kinds = (kind?: RoomState['kind']) => {
    const s = createRoomState('room02', 'Sala', 0, null, { kind: kind ?? 'anime' });
    if (!kind) delete s.kind; // rooms created before series and movies existed
    return s;
  };
  const add = (s: RoomState, a: ReturnType<typeof anime>) => () => apply(s, { type: 'anime.add', anime: a });

  it('only takes the titles the room is about', () => {
    const old = kinds();
    expect(add(old, anime(1))).not.toThrow();
    expect(add(old, title('tv', 1396, 'Breaking Bad'))).toThrow(new OpError('media_not_allowed'));

    const series = kinds('series');
    expect(add(series, title('tv', 1396, 'Breaking Bad'))).not.toThrow();
    expect(add(series, title('movie', 238, 'O Padrinho'))).toThrow(new OpError('media_not_allowed'));
    expect(add(series, anime(1))).toThrow(new OpError('media_not_allowed'));

    const movies = kinds('movies');
    expect(add(movies, title('movie', 238, 'O Padrinho'))).not.toThrow();
    expect(add(movies, title('tv', 1396))).toThrow(new OpError('media_not_allowed'));

    const all = kinds('all');
    for (const a of [anime(1), title('tv', 1396), title('movie', 238)]) expect(add(all, a)).not.toThrow();
    expect(Object.keys(all.anime).sort()).toEqual(['al:1', 'mv:238', 'tv:1396']);
    // A series and a movie can share the same TMDB id: they are different titles.
    expect(add(all, title('movie', 1396))).not.toThrow();
    expect(Object.keys(all.anime)).toContain('mv:1396');
  });

  it('can change what the room holds while the titles in it still fit', () => {
    const s = kinds(); // an old anime room
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'room.kind', kind: 'all' });
    expect(s.kind).toBe('all');
    expect(s.activity.at(-1)).toMatchObject({ kind: 'kind', text: 'all' });
    apply(s, { type: 'anime.add', anime: title('movie', 238, 'O Padrinho') });

    // Films only would leave the anime out: it has to go first.
    const films = () => apply(s, { type: 'room.kind', kind: 'movies' });
    expect(films).toThrow(new OpError('kind_conflict'));
    expect(s.kind).toBe('all');
    apply(s, { type: 'anime.remove', key: 'al:1' });
    films();
    expect(s.kind).toBe('movies');
    const before = s.activity.length;
    films(); // no change, no activity
    expect(s.activity).toHaveLength(before);
    expect(add(s, title('tv', 1396))).toThrow(new OpError('media_not_allowed'));
  });
});

describe('board.move', () => {
  it('moves between tiers and reorders', () => {
    const s = room();
    for (const id of [1, 2, 3]) apply(s, { type: 'anime.add', anime: anime(id) });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:2', to: 's', index: 5 });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:3', to: 's', index: 0 });
    expect(s.boards[GROUP_BOARD].s).toEqual(['al:3', 'al:1', 'al:2']);
    // reorder inside the same tier
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:3', to: 's', index: 2 });
    expect(s.boards[GROUP_BOARD].s).toEqual(['al:1', 'al:2', 'al:3']);
    // move to another tier
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:2', to: 'c', index: 0 });
    expect(s.boards[GROUP_BOARD].s).toEqual(['al:1', 'al:3']);
    expect(s.boards[GROUP_BOARD].c).toEqual(['al:2']);
    // back to the pool
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:2', to: POOL, index: 0 });
    expect(tierOf(s, GROUP_BOARD, 'al:2')).toBeNull();
  });

  it('creates personal boards lazily and keeps them independent', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'board.move', board: 'rui', key: 'al:1', to: 'f', index: 0 }, 'rui');
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 }, 'rui');
    expect(tierOf(s, 'rui', 'al:1')).toBe('f');
    expect(tierOf(s, GROUP_BOARD, 'al:1')).toBe('s');
    expect(tierOf(s, 'ana', 'al:1')).toBeNull();
  });

  it('rejects unknown anime, tiers and boards without touching the state', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    const before = JSON.stringify(s);
    expect(() => apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:9', to: 's', index: 0 })).toThrow(OpError);
    expect(() => apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 'zz', index: 0 })).toThrow(OpError);
    expect(() => apply(s, { type: 'board.move', board: 'nobody', key: 'al:1', to: 's', index: 0 })).toThrow(OpError);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('coalesces repeated moves of the same card in the activity feed', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 }, 'ana', 2_000);
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 'a', index: 0 }, 'ana', 3_000);
    const moves = s.activity.filter((a) => a.kind === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ to: 'a', toLabel: 'A' });
  });
});

describe('board.copy / board.clear', () => {
  it('copies the group tier list into a personal one and clears it', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'anime.add', anime: anime(2) });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:2', to: 'b', index: 0 });
    apply(s, { type: 'board.copy', board: 'rui', from: GROUP_BOARD }, 'rui');
    expect(s.boards.rui.s).toEqual(['al:1']);
    expect(s.boards.rui.b).toEqual(['al:2']);
    // copies are independent
    apply(s, { type: 'board.move', board: 'rui', key: 'al:1', to: 'f', index: 0 }, 'rui');
    expect(s.boards[GROUP_BOARD].s).toEqual(['al:1']);
    apply(s, { type: 'board.clear', board: 'rui' }, 'rui');
    expect(Object.values(s.boards.rui).flat()).toEqual([]);
  });
});

describe('review.set', () => {
  it('merges patches, and deletes the review when everything is cleared', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'review.set', key: 'al:1', patch: { rating: 8 } }, 'rui', 5_000);
    apply(s, { type: 'review.set', key: 'al:1', patch: { recommend: 'yes', opinion: 'Muito bom!' } }, 'rui', 6_000);
    expect(s.reviews['al:1'].rui).toEqual({
      rating: 8,
      recommend: 'yes',
      status: null,
      opinion: 'Muito bom!',
      updatedAt: 6_000,
    });
    // one coalesced activity entry
    const reviews = s.activity.filter((a) => a.kind === 'review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ rating: 8, recommend: 'yes', opinion: true });

    apply(s, { type: 'review.set', key: 'al:1', patch: { rating: null, recommend: null, opinion: '  ' } }, 'rui');
    expect(s.reviews['al:1']).toBeUndefined();
  });

  it('rejects invalid ratings and unknown anime', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    expect(() => apply(s, { type: 'review.set', key: 'al:1', patch: { rating: 11 } })).toThrow('invalid_rating');
    expect(() => apply(s, { type: 'review.set', key: 'al:1', patch: { rating: 7.5 } })).toThrow('invalid_rating');
    expect(() => apply(s, { type: 'review.set', key: 'al:2', patch: { rating: 5 } })).toThrow('anime_not_found');
  });
});

describe('tiers.set', () => {
  it('renames, adds and removes tiers; anime in removed tiers go back to the pool', () => {
    const s = room();
    apply(s, { type: 'anime.add', anime: anime(1) });
    apply(s, { type: 'anime.add', anime: anime(2) });
    apply(s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 });
    apply(s, { type: 'board.move', board: 'rui', key: 'al:2', to: 'f', index: 0 }, 'rui');
    apply(s, {
      type: 'tiers.set',
      tiers: [
        { id: 's', label: 'GOAT', color: '#ff0000' },
        { id: 'new', label: 'Novo', color: '#00ff00' },
      ],
    });
    expect(s.tiers.map((t) => t.label)).toEqual(['GOAT', 'Novo']);
    expect(s.boards[GROUP_BOARD]).toEqual({ s: ['al:1'], new: [] });
    expect(s.boards.rui).toEqual({ s: [], new: [] });
  });

  it('rejects duplicate ids and the reserved pool id', () => {
    const s = room();
    expect(() =>
      apply(s, {
        type: 'tiers.set',
        tiers: [
          { id: 'x', label: 'X', color: '#ff0000' },
          { id: 'x', label: 'Y', color: '#ff0000' },
        ],
      }),
    ).toThrow(OpError);
    expect(() => apply(s, { type: 'tiers.set', tiers: [{ id: POOL, label: 'P', color: '#ff0000' }] })).toThrow(OpError);
  });
});

describe('members, chat and rename', () => {
  it('records joins once and updates profiles', () => {
    const s = room();
    apply(s, { type: 'member.join', member: { id: 'ana', name: 'Ana M.', color: '#123456', avatar: '🐱' } });
    expect(s.members.ana.name).toBe('Ana M.');
    expect(s.activity.filter((a) => a.kind === 'join')).toHaveLength(2);
    apply(s, { type: 'member.update', name: 'Rui P.', color: '#654321', avatar: '🐸' }, 'rui');
    expect(s.members.rui).toMatchObject({ name: 'Rui P.', avatar: '🐸' });
    expect(() => apply(s, { type: 'member.update', name: 'X', color: '#000000', avatar: '' }, 'ghost')).toThrow(OpError);
  });

  it('chat messages are idempotent by id and capped', () => {
    const s = room();
    apply(s, { type: 'chat.send', id: 'm1', text: '  olá  ' });
    apply(s, { type: 'chat.send', id: 'm1', text: 'olá' });
    expect(s.chat).toHaveLength(1);
    expect(s.chat[0].text).toBe('olá');
    for (let i = 0; i < 400; i++) apply(s, { type: 'chat.send', id: `x${i}`, text: `msg ${i}` });
    expect(s.chat).toHaveLength(300);
    expect(s.chat.at(-1)?.text).toBe('msg 399');
  });

  it('renames the room', () => {
    const s = room();
    apply(s, { type: 'room.rename', name: '  ESTG 2º ano ' });
    expect(s.name).toBe('ESTG 2º ano');
    expect(() => apply(s, { type: 'room.rename', name: '   ' })).toThrow(OpError);
  });
});

describe('community space', () => {
  it('has no owner and holds far more people than a room', () => {
    const s = createRoomState('comunidade', 'Comunidade', 0, null, { kind: 'all', global: true });
    for (let i = 0; i < 150; i++) {
      apply(s, { type: 'member.join', member: { id: `user${i}`, name: `P${i}`, color: '#ff0000', avatar: '' } }, `user${i}`);
    }
    expect(Object.keys(s.members)).toHaveLength(150);
    expect(s.createdBy).toBeNull();
    // A normal room stops at its limit.
    const r = createRoomState('room03', 'Sala', 0);
    for (let i = 0; i < 100; i++) apply(r, { type: 'member.join', member: { id: `u${i}`, name: 'x', color: '#ff0000', avatar: '' } }, `u${i}`);
    expect(() => apply(r, { type: 'member.join', member: { id: 'one-more', name: 'x', color: '#ff0000', avatar: '' } }, 'one-more')).toThrow(
      new OpError('limit_members'),
    );
  });
});

describe('community rooms', () => {
  it('rooms start hidden and can be shown in (or removed from) the community rooms', () => {
    const s = room();
    expect(s.listed).toBe(false);
    expect(createRoomState('r', 'Aberta', 0, null, { listed: true }).listed).toBe(true);
    apply(s, { type: 'room.listed', listed: true });
    expect(s.listed).toBe(true);
    expect(s.activity.at(-1)).toMatchObject({ kind: 'listed', listed: true });
    const before = s.activity.length;
    apply(s, { type: 'room.listed', listed: true }); // no change, no activity
    expect(s.activity).toHaveLength(before);
    apply(s, { type: 'room.listed', listed: false });
    expect(s.listed).toBe(false);
  });
});

describe('company or unit', () => {
  it('is part of the member profile', () => {
    const s = room();
    expect(s.members.ana.unit).toBe('');
    apply(s, { type: 'member.update', name: 'Ana', color: '#ff0000', avatar: '🦊', unit: 'Lusiaves, Marinha das Ondas' });
    expect(s.members.ana.unit).toBe('Lusiaves, Marinha das Ondas');
    apply(s, { type: 'member.join', member: { id: 'ana', name: 'Ana', color: '#ff0000', avatar: '🦊', unit: 'Leiria' } }, 'ana');
    expect(s.members.ana.unit).toBe('Leiria');
    // Older browsers do not send it.
    apply(s, { type: 'member.update', name: 'Ana', color: '#ff0000', avatar: '🦊' });
    expect(s.members.ana.unit).toBe('');
  });
});

describe('room owner', () => {
  it('starts with whoever joins first and can be handed to another member', () => {
    const s = room();
    expect(s.createdBy).toBe('ana');
    apply(s, { type: 'room.owner', to: 'rui' });
    expect(s.createdBy).toBe('rui');
    expect(s.activity.at(-1)).toMatchObject({ kind: 'owner', by: 'ana', to: 'rui' });
    const before = s.activity.length;
    apply(s, { type: 'room.owner', to: 'rui' }, 'rui'); // already the owner: nothing happens
    expect(s.activity).toHaveLength(before);
    expect(() => apply(s, { type: 'room.owner', to: 'ghost' }, 'rui')).toThrow(new OpError('not_member'));
    expect(s.createdBy).toBe('rui');
  });
});

describe('books, restaurants and places', () => {
  it('each has its own kind of room', () => {
    const books = createRoomState('livros', 'Livros', 0, null, { kind: 'books', global: true });
    apply(books, { type: 'anime.add', anime: book(45804, 'Os Maias') });
    expect(() => apply(books, { type: 'anime.add', anime: spot('restaurant', 1) })).toThrow(new OpError('media_not_allowed'));
    const food = createRoomState('restaurantes', 'Restaurantes', 0, null, { kind: 'restaurants' });
    apply(food, { type: 'anime.add', anime: spot('restaurant', 1, 'Tasca do Zé') });
    expect(() => apply(food, { type: 'anime.add', anime: spot('place', 2) })).toThrow(new OpError('media_not_allowed'));
    expect(() => apply(food, { type: 'anime.add', anime: book(1) })).toThrow(new OpError('media_not_allowed'));
  });

  it('a place added by hand twice (same name, same town) is refused', () => {
    const s = createRoomState('restaurantes', 'Restaurantes', 0, null, { kind: 'restaurants' });
    apply(s, { type: 'anime.add', anime: spot('restaurant', 'xaaaaaaaaaa', 'Tasca do Zé', 'Leiria') });
    const twin = spot('restaurant', 'xbbbbbbbbbb', ' tasca do ze ', 'LEIRIA');
    expect(() => apply(s, { type: 'anime.add', anime: twin })).toThrow(new OpError('already_in_room'));
    // Same name somewhere else is another restaurant.
    apply(s, { type: 'anime.add', anime: spot('restaurant', 'xcccccccccc', 'Tasca do Zé', 'Porto') });
    expect(Object.keys(s.anime)).toHaveLength(2);
  });
});

describe('photos', () => {
  const id = (n: number) => `photo${String(n).padStart(16, '0')}`;
  const withPlace = () => {
    const s = room();
    s.kind = 'restaurants';
    apply(s, { type: 'anime.add', anime: spot('restaurant', 1, 'Tasca do Zé') });
    return s;
  };

  it('are added to a title, in order, as one activity entry for several in a row', () => {
    const s = withPlace();
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(1), w: 1280, h: 960 } }, 'ana', 1_000);
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(2), w: 960, h: 1280 } }, 'ana', 2_000);
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(2), w: 960, h: 1280 } }, 'ana', 2_500); // repeated
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(3), w: 800, h: 800 } }, 'rui', 3_000);
    expect(s.photos!['rs:n1'].map((p) => [p.id, p.by])).toEqual([
      [id(1), 'ana'],
      [id(2), 'ana'],
      [id(3), 'rui'],
    ]);
    const photoActivity = s.activity.filter((a) => a.kind === 'photo');
    expect(photoActivity.map((a) => [a.by, a.count])).toEqual([
      ['ana', 2],
      ['rui', 1],
    ]);
    expect(() => apply(s, { type: 'photo.add', key: 'rs:n9', photo: { id: id(4), w: 1, h: 1 } })).toThrow(
      new OpError('anime_not_found'),
    );
  });

  it('have limits per person and per room', () => {
    const s = withPlace();
    for (let i = 0; i < LIMITS.photosPerMember; i++) apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(i), w: 1, h: 1 } });
    expect(() => apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(99), w: 1, h: 1 } })).toThrow(
      new OpError('limit_photos_title'),
    );
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(99), w: 1, h: 1 } }, 'rui');
    const full = withPlace();
    full.photos = { 'rs:n1': Array.from({ length: LIMITS.maxPhotos }, (_, i) => ({ id: id(i), by: `m${i}`, at: 0, w: 1, h: 1 })) };
    expect(() => apply(full, { type: 'photo.add', key: 'rs:n1', photo: { id: id(9999), w: 1, h: 1 } })).toThrow(
      new OpError('limit_photos'),
    );
  });

  it('are removed one by one, or all together with their title', () => {
    const s = withPlace();
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(1), w: 1, h: 1 } });
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: { id: id(2), w: 1, h: 1 } });
    apply(s, { type: 'photo.remove', key: 'rs:n1', id: id(1) });
    expect(s.photos!['rs:n1'].map((p) => p.id)).toEqual([id(2)]);
    apply(s, { type: 'photo.remove', key: 'rs:n1', id: id(1) }); // already gone: nothing happens
    apply(s, { type: 'anime.remove', key: 'rs:n1' });
    expect(s.photos!['rs:n1']).toBeUndefined();
  });
});

describe('works on immutable (Immer) state too', () => {
  it('produces a new state without mutating the frozen original', () => {
    const base = produce(room(), () => {});
    const next = produce(base, (d) => {
      applyOp(d, { type: 'anime.add', anime: anime(7) }, meta());
      applyOp(d, { type: 'board.move', board: GROUP_BOARD, key: 'al:7', to: 'a', index: 0 }, meta());
    });
    expect(base.anime['al:7']).toBeUndefined();
    expect(next.boards[GROUP_BOARD].a).toEqual(['al:7']);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('member.remove (an admin deleting someone)', () => {
  it('takes the person out with what was only theirs', () => {
    const s = room();
    apply(s, { type: 'member.join', member: { id: 'eva', name: 'Eva', color: '#0000ff', avatar: '🐙' } }, 'eva');
    // Eva adds three titles: one nobody else touched, one Ana reviewed, one Rui put in a tier.
    apply(s, { type: 'anime.add', anime: anime(1, 'Só da Eva') }, 'eva');
    apply(s, { type: 'anime.add', anime: anime(2, 'Com opinião da Ana') }, 'eva');
    apply(s, { type: 'anime.add', anime: anime(3, 'No tier do Rui') }, 'eva');
    apply(s, { type: 'anime.add', anime: anime(4, 'Da Ana') });
    apply(s, { type: 'review.set', key: 'al:2', patch: { rating: 8 } }, 'ana');
    apply(s, { type: 'board.move', board: 'rui', key: 'al:3', to: 'a', index: 0 }, 'rui');
    // Eva's own things.
    apply(s, { type: 'review.set', key: 'al:4', patch: { rating: 2, opinion: 'teste' } }, 'eva');
    apply(s, { type: 'board.move', board: 'eva', key: 'al:4', to: 's', index: 0 }, 'eva');
    apply(s, { type: 'chat.send', id: 'm1', text: 'olá, sou a Eva' }, 'eva');
    apply(s, { type: 'chat.send', id: 'm2', text: 'olá Eva' }, 'ana');
    apply(s, { type: 'room.owner', to: 'eva' }, 'ana');

    apply(s, { type: 'member.remove', id: 'eva' }, 'ana');
    expect(Object.keys(s.members).sort()).toEqual(['ana', 'rui']);
    expect(s.boards.eva).toBeUndefined();
    expect(s.reviews['al:4']).toBeUndefined();
    expect(s.reviews['al:2'].ana.rating).toBe(8);
    expect(Object.keys(s.anime).sort()).toEqual(['al:2', 'al:3', 'al:4']);
    expect(s.chat.map((c) => c.text)).toEqual(['olá Eva']);
    expect(s.activity.some((a) => a.by === 'eva' || a.to === 'eva')).toBe(false);
    // The room she owned can now be taken over (her id no longer names a member).
    expect(s.members[s.createdBy!]).toBeUndefined();
    // Removing someone who is not there changes nothing.
    const before = JSON.stringify(s);
    apply(s, { type: 'member.remove', id: 'eva' }, 'ana');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('takes their photos, and titles that only had their photos', () => {
    const s = room();
    s.kind = 'restaurants';
    apply(s, { type: 'anime.add', anime: spot('restaurant', 1, 'Tasca') }, 'rui');
    apply(s, { type: 'anime.add', anime: spot('restaurant', 2, 'Só com fotos da Ana') }, 'ana');
    const photo = (n: number) => ({ id: `photo${String(n).padStart(16, '0')}`, w: 100, h: 100 });
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: photo(1) }, 'ana');
    apply(s, { type: 'photo.add', key: 'rs:n1', photo: photo(2) }, 'rui');
    apply(s, { type: 'photo.add', key: 'rs:n2', photo: photo(3) }, 'ana');
    apply(s, { type: 'member.remove', id: 'ana' }, 'rui');
    expect(s.photos!['rs:n1'].map((p) => p.by)).toEqual(['rui']);
    expect(s.photos!['rs:n2']).toBeUndefined();
    expect(s.anime['rs:n2']).toBeUndefined();
    expect(s.anime['rs:n1']).toBeDefined();
  });
});
