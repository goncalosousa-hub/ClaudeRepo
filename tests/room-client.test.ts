import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { RoomClient, type RoomSnapshot } from '../src/client/lib/room-client';
import { GROUP_BOARD } from '../src/shared/types';
import { anime } from './fixtures';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-client-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const app = await createApp({ dev: false, dataDir: dir, clientDir: dir, rooms: { saveDelayMs: 5 } });
  await new Promise<void>((r) => app.httpServer.listen(0, '127.0.0.1', r));
  cleanups.push(async () => {
    await app.close();
    await new Promise((r) => app.httpServer.close(r));
  });
  const url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
  const res = await fetch(`${url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Turma' }),
  });
  const { id } = (await res.json()) as { id: string };
  return { url, roomId: id };
}

function makeClient(url: string, roomId: string, name: string) {
  const user = { id: `u_${name}_1234567`, secret: `${name}-secret-0123456789`, name, color: '#ff00aa', avatar: '🦊' };
  const c = new RoomClient(roomId, user, { url, transports: ['websocket'] });
  cleanups.push(() => c.destroy());
  return c;
}

function waitFor(c: RoomClient, pred: (s: RoomSnapshot) => boolean, timeout = 3000): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    if (pred(c.getSnapshot())) return resolve(c.getSnapshot());
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('timeout'));
    }, timeout);
    const unsub = c.subscribe(() => {
      if (!pred(c.getSnapshot())) return;
      clearTimeout(timer);
      unsub();
      resolve(c.getSnapshot());
    });
  });
}

describe('RoomClient', () => {
  it('applies my ops immediately and syncs them to the others', async () => {
    const { url, roomId } = await setup();
    const a = makeClient(url, roomId, 'ana');
    const b = makeClient(url, roomId, 'rui');
    await waitFor(a, (s) => s.status === 'joined');
    await waitFor(b, (s) => s.status === 'joined');
    await waitFor(a, (s) => !!s.presence[b.me]);

    expect(a.dispatch({ type: 'anime.add', anime: anime(1, 'Frieren') })).toBeNull();
    expect(a.dispatch({ type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 })).toBeNull();
    // Optimistic: visible before the server answers.
    expect(a.getSnapshot().room!.boards[GROUP_BOARD].s).toEqual(['al:1']);
    expect(a.getSnapshot().pendingCount).toBe(2);

    await waitFor(a, (s) => s.pendingCount === 0);
    const bs = await waitFor(b, (s) => s.room?.boards[GROUP_BOARD].s[0] === 'al:1');
    expect(bs.flashes['al:1']?.by).toBe(a.me);

    // Presence travels too.
    a.setPresence({ tab: 'explore' });
    await waitFor(b, (s) => s.presence[a.me]?.tab === 'explore');
  });

  it('refuses invalid ops locally and rolls back ops the server rejects', async () => {
    const { url, roomId } = await setup();
    const a = makeClient(url, roomId, 'ana');
    const b = makeClient(url, roomId, 'rui');
    await waitFor(a, (s) => s.status === 'joined');
    await waitFor(b, (s) => s.status === 'joined');
    await waitFor(a, (s) => !!s.room?.members[b.me]);

    expect(a.dispatch({ type: 'board.move', board: GROUP_BOARD, key: 'al:404', to: 's', index: 0 })).toBe(
      'anime_not_found',
    );

    a.dispatch({ type: 'anime.add', anime: anime(2) });
    await waitFor(a, (s) => s.pendingCount === 0);
    const errors: string[] = [];
    a.onError((code) => errors.push(code));
    // Moving on someone else's personal tier list: accepted locally, refused by the server.
    a.dispatch({ type: 'board.move', board: b.me, key: 'al:2', to: 's', index: 0 });
    expect(a.getSnapshot().room!.boards[b.me]?.s).toEqual(['al:2']);
    await waitFor(a, (s) => s.pendingCount === 0);
    expect(errors).toEqual(['forbidden']);
    expect(a.getSnapshot().room!.boards[b.me]?.s ?? []).toEqual([]);
  });

  it('keeps ops made while offline and sends them after reconnecting', async () => {
    const { url, roomId } = await setup();
    const a = makeClient(url, roomId, 'ana');
    const b = makeClient(url, roomId, 'rui');
    await waitFor(a, (s) => s.status === 'joined');
    await waitFor(b, (s) => s.status === 'joined');

    const socket = (a as unknown as { socket: { disconnect(): void; connect(): void } }).socket;
    socket.disconnect();
    await waitFor(a, (s) => s.status === 'reconnecting');
    a.dispatch({ type: 'anime.add', anime: anime(3, 'Mushishi') });
    a.dispatch({ type: 'chat.send', id: 'offline1', text: 'estava offline' });
    expect(a.getSnapshot().room!.anime['al:3']).toBeTruthy();

    socket.connect();
    await waitFor(a, (s) => s.status === 'joined' && s.pendingCount === 0);
    const bs = await waitFor(b, (s) => !!s.room?.anime['al:3'] && s.room.chat.length === 1);
    expect(bs.room!.chat[0].text).toBe('estava offline');
  });

  it('reports fatal errors', async () => {
    const { url } = await setup();
    const c = makeClient(url, 'zzzzzzzz', 'ana');
    const s = await waitFor(c, (x) => x.status === 'error');
    expect(s.error).toBe('room_not_found');
  });
});
