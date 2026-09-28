import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { produce } from 'immer';
import { createApp } from '../src/server/app';
import { applyOp } from '../src/shared/ops';
import {
  GROUP_BOARD,
  type JoinAck,
  type JoinOk,
  type OpAck,
  type OpEnvelope,
  type RoomState,
  type SyncAck,
} from '../src/shared/types';
import { anime } from './fixtures';

type App = Awaited<ReturnType<typeof createApp>> & { url: string };
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-test-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function start(dataDir: string, databaseUrl?: string): Promise<App> {
  const app = await createApp({
    dev: false,
    dataDir,
    databaseUrl,
    clientDir: dataDir,
    rooms: { saveDelayMs: 5, maxSaveDelayMs: 20 },
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = app.httpServer.address() as AddressInfo;
  let closed = false;
  const stop = async () => {
    if (closed) return;
    closed = true;
    await app.close();
    await new Promise((r) => app.httpServer.close(r));
  };
  cleanups.push(stop);
  return Object.assign(app, { url: `http://127.0.0.1:${port}`, close: stop });
}

function client(app: App): Socket {
  const s = connect(app.url, { transports: ['websocket'], forceNew: true, reconnection: false });
  cleanups.push(async () => void s.disconnect());
  return s;
}

const emit = <T>(s: Socket, event: string, payload?: unknown) =>
  new Promise<T>((resolve) => (payload === undefined ? s.emit(event, resolve) : s.emit(event, payload, resolve)));

function next<T>(s: Socket, event: string, match: (v: T) => boolean = () => true, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    const handler = (v: T) => {
      if (!match(v)) return;
      clearTimeout(timer);
      s.off(event, handler);
      resolve(v);
    };
    s.on(event, handler);
  });
}

const user = (id: string, name = id) => ({
  id: `user_${id}_000`,
  secret: `secret-${id}-0123456789abcdef`,
  name,
  color: '#3366ff',
  avatar: '🦊',
});

async function createRoom(app: App, name = 'Turma') {
  const res = await fetch(`${app.url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function join(app: App, roomId: string, u = user('ana')) {
  const s = client(app);
  const ack = await emit<JoinAck>(s, 'join', { roomId, user: u });
  if (!ack.ok) throw new Error(ack.error);
  return { s, ack: ack as JoinOk, userId: u.id };
}

let cid = 0;
const op = (s: Socket, o: unknown) => emit<OpAck>(s, 'op', { cid: `c${++cid}`, op: o });

describe('HTTP API', () => {
  it('creates rooms and reports room info', async () => {
    const app = await start(await tmpDir());
    const id = await createRoom(app, 'ESTG');
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    const info = await (await fetch(`${app.url}/api/rooms/${id}`)).json();
    expect(info).toMatchObject({ id, name: 'ESTG', members: 0, anime: 0, online: 0 });
    expect((await fetch(`${app.url}/api/rooms/nope12345`)).status).toBe(404);
    expect((await fetch(`${app.url}/api/rooms`, { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await fetch(`${app.url}/api/img?url=${encodeURIComponent('https://evil.example/a.png')}`)).status).toBe(400);
    expect((await fetch(`${app.url}/api/whatever`)).status).toBe(404);
  });
});

describe('realtime rooms', () => {
  it('syncs ops between members with increasing sequence numbers', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app);
    const a = await join(app, roomId, user('ana', 'Ana'));
    const b = await join(app, roomId, user('rui', 'Rui'));
    expect(Object.keys(b.ack.state.members).sort()).toEqual([a.userId, b.userId].sort());
    expect(b.ack.presence.map((p) => p.userId).sort()).toEqual([a.userId, b.userId].sort());

    // B mirrors the state by applying every broadcast op, exactly like the browser does.
    let mirror: RoomState = b.ack.state;
    let seq = b.ack.seq;
    b.s.on('op', (env: OpEnvelope) => {
      expect(env.seq).toBe(seq + 1);
      seq = env.seq;
      mirror = produce(mirror, (d) => applyOp(d, env.op, env));
    });

    const seen = next<OpEnvelope>(b.s, 'op', (e) => e.op.type === 'board.move');
    expect(await op(a.s, { type: 'anime.add', anime: anime(1, 'Frieren') })).toMatchObject({ ok: true });
    expect(await op(a.s, { type: 'board.move', board: GROUP_BOARD, key: 'al:1', to: 's', index: 0 })).toMatchObject({
      ok: true,
    });
    const env = await seen;
    expect(env.by).toBe(a.userId);
    const reviewSeen = next(a.s, 'op', (e: OpEnvelope) => e.op.type === 'review.set');
    expect(await op(b.s, { type: 'review.set', key: 'al:1', patch: { rating: 9, recommend: 'yes' } })).toMatchObject({
      ok: true,
    });
    await reviewSeen;

    const sync = await emit<SyncAck>(a.s, 'sync');
    if (!sync.ok) throw new Error(sync.error);
    expect(sync.seq).toBe(seq);
    expect(mirror).toEqual(sync.state);
    expect(sync.state.boards[GROUP_BOARD].s).toEqual(['al:1']);
    expect(sync.state.reviews['al:1'][b.userId]).toMatchObject({ rating: 9, recommend: 'yes' });
  });

  it('rejects invalid ops, foreign boards and impostors', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app);
    const a = await join(app, roomId, user('ana'));
    const b = await join(app, roomId, user('rui'));
    await op(a.s, { type: 'anime.add', anime: anime(1) });

    expect(await op(a.s, { type: 'board.move', board: b.userId, key: 'al:1', to: 's', index: 0 })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await op(a.s, { type: 'board.clear', board: GROUP_BOARD })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(a.s, { type: 'board.move', board: GROUP_BOARD, key: 'al:2', to: 's', index: 0 })).toEqual({
      ok: false,
      error: 'anime_not_found',
    });
    expect(await op(a.s, { type: 'member.join', member: { id: 'x' } })).toEqual({ ok: false, error: 'invalid_op' });
    expect(
      await op(a.s, { type: 'anime.add', anime: { ...anime(3), cover: 'https://tracker.example/pixel.gif' } }),
    ).toEqual({ ok: false, error: 'invalid_op' });

    // Someone else trying to use Ana's id without her secret.
    const impostor = client(app);
    const ack = await emit<JoinAck>(impostor, 'join', { roomId, user: { ...user('ana'), secret: 'x'.repeat(24) } });
    expect(ack).toEqual({ ok: false, error: 'auth_failed' });

    const nobody = client(app);
    expect(await emit<JoinAck>(nobody, 'join', { roomId: 'zzzzzzzz', user: user('eva') })).toEqual({
      ok: false,
      error: 'room_not_found',
    });
    expect(await emit<OpAck>(nobody, 'op', { cid: 'c1', op: { type: 'room.rename', name: 'x' } })).toEqual({
      ok: false,
      error: 'not_joined',
    });
  });

  it('relays presence, cursors and departures', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app);
    const a = await join(app, roomId, user('ana'));
    const joined = next<{ userId: string }>(a.s, 'presence');
    const b = await join(app, roomId, user('rui'));
    expect((await joined).userId).toBe(b.userId);

    const presence = next<{ userId: string; tab: string }>(a.s, 'presence', (p) => p.tab === 'explore');
    b.s.emit('presence', { tab: 'explore', board: GROUP_BOARD });
    expect((await presence).userId).toBe(b.userId);

    const cursor = next<{ userId: string; cursor: { zone: string } }>(a.s, 'cursor');
    b.s.emit('cursor', { board: GROUP_BOARD, zone: 's', fx: 0.5, fy: 0.25 });
    expect(await cursor).toEqual({ userId: b.userId, cursor: { board: GROUP_BOARD, zone: 's', fx: 0.5, fy: 0.25 } });

    const left = next<{ userId: string; at: number }>(a.s, 'presence:leave');
    b.s.disconnect();
    expect((await left).userId).toBe(b.userId);
  });

  it('keeps the rooms after a restart (JSON files)', async () => {
    const dir = await tmpDir();
    const app1 = await start(dir);
    const roomId = await createRoom(app1);
    const a = await join(app1, roomId, user('ana'));
    await op(a.s, { type: 'anime.add', anime: anime(42, 'Mushishi') });
    await op(a.s, { type: 'board.move', board: a.userId, key: 'al:42', to: 'a', index: 0 });
    await op(a.s, { type: 'chat.send', id: 'm1', text: 'olá turma' });
    a.s.disconnect();
    await app1.close();

    const app2 = await start(dir);
    const again = await join(app2, roomId, user('ana'));
    expect(again.ack.state.anime['al:42'].title).toBe('Mushishi');
    expect(again.ack.state.boards[again.userId].a).toEqual(['al:42']);
    expect(again.ack.state.chat.map((c) => c.text)).toEqual(['olá turma']);
    expect(again.ack.lastSeen[again.userId]).toBeGreaterThan(0);
    // The secret is remembered too.
    const impostor = client(app2);
    expect(await emit<JoinAck>(impostor, 'join', { roomId, user: { ...user('ana'), secret: 'y'.repeat(24) } })).toEqual({
      ok: false,
      error: 'auth_failed',
    });
  });

  it.runIf(process.env.TEST_DATABASE_URL)('keeps the rooms after a restart (PostgreSQL)', async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const app1 = await start(await tmpDir(), url);
    expect(app1.storage.kind).toBe('postgres');
    const roomId = await createRoom(app1, 'PG');
    const a = await join(app1, roomId, user('ana'));
    await op(a.s, { type: 'anime.add', anime: anime(7) });
    await op(a.s, { type: 'review.set', key: 'al:7', patch: { rating: 10, opinion: 'obra-prima' } });
    a.s.disconnect();
    await app1.close();

    const app2 = await start(await tmpDir(), url);
    const again = await join(app2, roomId, user('ana'));
    expect(again.ack.state.name).toBe('PG');
    expect(again.ack.state.reviews['al:7'][again.userId]).toMatchObject({ rating: 10, opinion: 'obra-prima' });
  });
});
