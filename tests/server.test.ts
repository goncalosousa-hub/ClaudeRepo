import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
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
import { FAKE_TMDB_KEY, startFakeTmdb } from './fake-tmdb';
import { anime, title } from './fixtures';

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

async function start(dataDir: string, databaseUrl?: string, extra: Partial<Parameters<typeof createApp>[0]> = {}): Promise<App> {
  const app = await createApp({
    dev: false,
    dataDir,
    databaseUrl,
    clientDir: dataDir,
    rooms: { saveDelayMs: 5, maxSaveDelayMs: 20 },
    ...extra,
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = app.httpServer.address() as AddressInfo;
  let closed = false;
  // Keep the real close: `app.close` is replaced by `stop` below.
  const shutdown = app.close;
  const stop = async () => {
    if (closed) return;
    closed = true;
    await shutdown();
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

async function createRoom(app: App, name = 'Turma', kind?: string) {
  const res = await fetch(`${app.url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind }),
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

  it('tells only the host machine its local network addresses', async () => {
    const app = await start(await tmpDir());
    const local = (await (await fetch(`${app.url}/api/network`)).json()) as { lan: { url: string }[] };
    expect(Array.isArray(local.lan)).toBe(true);
    for (const a of local.lan) expect(a.url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/);
    // Through a tunnel the Host header is the public name: no addresses are revealed.
    const viaTunnel = await new Promise<string>((resolve, reject) => {
      const req = http.request(`${app.url}/api/network`, { headers: { host: 'abc.trycloudflare.com' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.end();
    });
    expect(JSON.parse(viaTunnel)).toEqual({ lan: [] });
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

  it.runIf(process.env.TEST_DATABASE_URL)('copies the rooms from the JSON files when switching to PostgreSQL', async () => {
    const dir = await tmpDir();
    const files = await start(dir);
    const roomId = await createRoom(files, 'Antes da BD');
    const a = await join(files, roomId, user('ana'));
    await op(a.s, { type: 'anime.add', anime: anime(9, 'Monster') });
    a.s.disconnect();
    await files.close();

    const pg1 = await start(dir, process.env.TEST_DATABASE_URL!);
    expect(pg1.imported).toBeGreaterThanOrEqual(1);
    const again = await join(pg1, roomId, user('ana'));
    expect(again.ack.state.name).toBe('Antes da BD');
    expect(again.ack.state.anime['al:9'].title).toBe('Monster');
    again.s.disconnect();
    await pg1.close();

    const pg2 = await start(dir, process.env.TEST_DATABASE_URL!);
    expect(pg2.imported).toBe(0);
  });
});

async function api<T = Record<string, unknown>>(
  app: App,
  method: string,
  url: string,
  body?: unknown,
  auth?: { username: string; secret: string },
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Account ${auth.username}:${auth.secret}`;
  const res = await fetch(`${app.url}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
}

interface LoginResult {
  username: string;
  user: { id: string; secret: string; name: string; color: string; avatar: string; account: string };
  rooms: { id: string; name: string; visitedAt: number }[];
}

const profile = (name: string) => ({ name, color: '#3366ff', avatar: '🦊' });
const register = (app: App, username: string, password = 'pass-1234', extra: object = {}) =>
  api<LoginResult>(app, 'POST', '/api/auth/register', { username, password, ...profile(username), ...extra });
const login = (app: App, username: string, password = 'pass-1234') =>
  api<LoginResult>(app, 'POST', '/api/auth/login', { username, password });
const auth = (r: LoginResult) => ({ username: r.username, secret: r.user.secret });

/** Waits until "As tuas salas" of the account matches (visits are saved right after the join ack). */
async function accountRooms(app: App, r: LoginResult, expected: number) {
  for (let i = 0; i < 50; i++) {
    const res = await api<{ rooms: LoginResult['rooms'] }>(app, 'GET', '/api/account', undefined, auth(r));
    if (res.body.rooms.length === expected) return res.body.rooms;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`the account never had ${expected} room(s)`);
}

describe('accounts', () => {
  it('registers, refuses taken or invalid usernames and logs in with the same identity', async () => {
    const app = await start(await tmpDir());
    const created = await register(app, 'Ana.Sofia');
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: 'ana.sofia', rooms: [], user: { name: 'Ana.Sofia', account: 'ana.sofia' } });
    expect(created.body.user.id).toMatch(/^u_/);

    expect((await register(app, 'ANA.SOFIA')).body).toEqual({ error: 'username_taken' });
    expect((await register(app, 'ANA.SOFIA')).status).toBe(409);
    expect((await register(app, 'a')).body).toEqual({ error: 'invalid_username' });
    expect((await register(app, 'com1')).body).toEqual({ error: 'invalid_username' });
    expect((await register(app, '../etc')).body).toEqual({ error: 'invalid_username' });
    expect((await register(app, 'bruno', '123')).body).toEqual({ error: 'invalid_password' });
    // An identity must come with its secret.
    expect((await register(app, 'bruno', 'pass-1234', { id: 'u_abcdefgh1234' })).status).toBe(400);

    expect(await login(app, 'ana.sofia', 'wrong-pass')).toEqual({ status: 401, body: { error: 'invalid_credentials' } });
    expect(await login(app, 'nobody', 'pass-1234')).toEqual({ status: 401, body: { error: 'invalid_credentials' } });
    const again = await login(app, '  Ana.Sofia ');
    expect(again.status).toBe(200);
    expect(again.body.user).toEqual(created.body.user);
  });

  it('keeps the profile someone already uses in rooms when they create an account', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app, 'Turma A');
    const guest = user('ana', 'Ana');
    const a = await join(app, roomId, guest);
    await op(a.s, { type: 'anime.add', anime: anime(5, 'Frieren') });
    await op(a.s, { type: 'review.set', key: 'al:5', patch: { rating: 10 } });
    a.s.disconnect();

    const created = await register(app, 'ana', 'pass-1234', { id: guest.id, secret: guest.secret });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ id: guest.id, secret: guest.secret });

    // Another device / another link: log in and enter the room as the same member.
    const device = (await login(app, 'ana')).body.user;
    const b = await join(app, roomId, device);
    expect(Object.keys(b.ack.state.members)).toEqual([guest.id]);
    expect(b.ack.state.reviews['al:5'][guest.id]).toMatchObject({ rating: 10 });
  });

  it('starts "As tuas salas" with the rooms the profile was already in', async () => {
    const app = await start(await tmpDir());
    const guest = user('ana', 'Ana');
    const mine = await createRoom(app, 'Turma A');
    const notMine = await createRoom(app, 'Sala dos outros');
    (await join(app, mine, guest)).s.disconnect();
    (await join(app, notMine, user('bruno'))).s.disconnect();

    const created = await register(app, 'ana', 'pass-1234', {
      id: guest.id,
      secret: guest.secret,
      rooms: [
        { id: mine, visitedAt: 1000 },
        { id: notMine, visitedAt: 2000 }, // never joined with this profile: ignored
        { id: 'zzzz0000', visitedAt: 3000 }, // does not exist: ignored
      ],
    });
    expect(created.body.rooms).toEqual([{ id: mine, name: 'Turma A', visitedAt: 1000 }]);
    // A stolen room list cannot be attached to a new identity either.
    const other = await register(app, 'eve', 'pass-1234', { rooms: [{ id: mine, visitedAt: 1 }] });
    expect(other.body.rooms).toEqual([]);
  });

  it('remembers the rooms each account has been in', async () => {
    const app = await start(await tmpDir());
    const ana = (await register(app, 'ana')).body;
    const bruno = (await register(app, 'bruno')).body;
    const room1 = await createRoom(app, 'Turma A');
    const room2 = await createRoom(app, 'Clube de anime');

    const s1 = client(app);
    expect((await emit<JoinAck>(s1, 'join', { roomId: room1, user: ana.user, account: 'ana' })).ok).toBe(true);
    await accountRooms(app, ana, 1);
    const s2 = client(app);
    expect((await emit<JoinAck>(s2, 'join', { roomId: room2, user: ana.user, account: 'ana' })).ok).toBe(true);
    const rooms = await accountRooms(app, ana, 2);
    expect(rooms.map((r) => [r.id, r.name])).toEqual([
      [room2, 'Clube de anime'],
      [room1, 'Turma A'],
    ]);
    expect((await login(app, 'ana')).body.rooms.map((r) => r.id)).toEqual([room2, room1]);

    // Joining with someone else's account name does not add rooms to that account.
    const s3 = client(app);
    expect((await emit<JoinAck>(s3, 'join', { roomId: room1, user: bruno.user, account: 'ana' })).ok).toBe(true);
    // A broken account name never stops anyone from joining.
    const s4 = client(app);
    expect((await emit<JoinAck>(s4, 'join', { roomId: room2, user: bruno.user, account: '../x' })).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await accountRooms(app, ana, 2)).map((r) => r.id)).toEqual([room2, room1]);
    expect(await accountRooms(app, bruno, 0)).toEqual([]);

    expect((await api(app, 'DELETE', `/api/account/rooms/${room1}`, undefined, auth(ana))).status).toBe(200);
    expect((await accountRooms(app, ana, 1)).map((r) => r.id)).toEqual([room2]);
  });

  it('updates the profile and the password, and only with the right credentials', async () => {
    const app = await start(await tmpDir());
    const ana = (await register(app, 'ana')).body;
    expect((await api(app, 'GET', '/api/account')).status).toBe(401);
    expect((await api(app, 'GET', '/api/account', undefined, { username: 'ana', secret: 'x'.repeat(32) })).status).toBe(401);
    expect((await api(app, 'PATCH', '/api/account', profile('Hacker'), { username: 'ana', secret: 'x'.repeat(32) })).status).toBe(401);

    const renamed = { name: 'Ana Sofia', color: '#ff0066', avatar: '🐙' };
    expect((await api(app, 'PATCH', '/api/account', renamed, auth(ana))).status).toBe(200);
    expect((await api(app, 'PATCH', '/api/account', { name: '' }, auth(ana))).status).toBe(400);
    expect((await api(app, 'GET', '/api/account', undefined, auth(ana))).body).toMatchObject({ username: 'ana', profile: renamed });

    const change = (current: string, next: string) =>
      api(app, 'POST', '/api/account/password', { current, next }, auth(ana));
    expect(await change('wrong-pass', 'new-pass-5678')).toEqual({ status: 403, body: { error: 'wrong_password' } });
    expect((await change('pass-1234', '123')).status).toBe(400);
    expect((await change('pass-1234', 'new-pass-5678')).status).toBe(200);
    expect((await login(app, 'ana')).status).toBe(401);
    const again = await login(app, 'ana', 'new-pass-5678');
    expect(again.body.user).toMatchObject({ id: ana.user.id, ...renamed });
  });

  it('slows down password guessing', async () => {
    const app = await start(await tmpDir());
    await register(app, 'ana');
    for (let i = 0; i < 10; i++) expect((await login(app, 'ana', `guess-${i}`)).status).toBe(401);
    // Even the right password is refused for a while.
    expect(await login(app, 'ana')).toEqual({ status: 429, body: { error: 'rate_limited' } });
  });

  it('keeps accounts after a restart (JSON files)', async () => {
    const dir = await tmpDir();
    const app1 = await start(dir);
    const ana = (await register(app1, 'ana')).body;
    await app1.close();
    const app2 = await start(dir);
    expect((await login(app2, 'ana')).body.user).toEqual(ana.user);
    expect((await register(app2, 'ana')).status).toBe(409);
  });

  it.runIf(process.env.TEST_DATABASE_URL)('keeps accounts in PostgreSQL and copies the ones saved as files', async () => {
    const dir = await tmpDir();
    const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const files = await start(dir);
    const before = (await register(files, `f${suffix}`)).body;
    await files.close();

    const pg1 = await start(dir, process.env.TEST_DATABASE_URL!);
    expect(pg1.importedAccounts).toBeGreaterThanOrEqual(1);
    expect((await login(pg1, `f${suffix}`)).body.user).toEqual(before.user);
    const ana = (await register(pg1, `p${suffix}`)).body;
    const roomId = await createRoom(pg1, 'Sala PG');
    const s = client(pg1);
    expect((await emit<JoinAck>(s, 'join', { roomId, user: ana.user, account: ana.username })).ok).toBe(true);
    await accountRooms(pg1, ana, 1);
    s.disconnect();
    await pg1.close();

    const pg2 = await start(dir, process.env.TEST_DATABASE_URL!);
    expect(pg2.importedAccounts).toBe(0);
    expect((await register(pg2, `p${suffix}`)).status).toBe(409);
    const again = (await login(pg2, `p${suffix}`)).body;
    expect(again.user).toEqual(ana.user);
    expect(again.rooms.map((r) => [r.id, r.name])).toEqual([[roomId, 'Sala PG']]);
  });
});

describe('room owner', () => {
  it('only the owner renames the room or hands it over; an absent owner can be replaced', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app, 'Turma');
    const a = await join(app, roomId, user('ana'));
    const b = await join(app, roomId, user('rui'));
    expect(a.ack.state.createdBy).toBe(a.userId);

    expect(await op(b.s, { type: 'room.rename', name: 'Sala do Rui' })).toEqual({ ok: false, error: 'not_owner' });
    expect(await op(a.s, { type: 'room.rename', name: 'Turma ESTG' })).toMatchObject({ ok: true });
    // Rui cannot make himself the owner while Ana is around.
    expect(await op(b.s, { type: 'room.owner', to: b.userId })).toEqual({ ok: false, error: 'not_owner' });

    // Ana hands the room over: now only Rui renames it.
    expect(await op(a.s, { type: 'room.owner', to: b.userId })).toMatchObject({ ok: true });
    expect(await op(a.s, { type: 'room.rename', name: 'Outra' })).toEqual({ ok: false, error: 'not_owner' });
    expect(await op(b.s, { type: 'room.rename', name: 'Turma do Rui' })).toMatchObject({ ok: true });
    expect(await op(b.s, { type: 'room.owner', to: 'user_ghost_000' })).toEqual({ ok: false, error: 'not_member' });

    // Rui disappears (e.g. he lost his profile). A week later Ana can take the room back.
    b.s.disconnect();
    const live = (await app.rooms.get(roomId))!;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await op(a.s, { type: 'room.owner', to: a.userId })).toEqual({ ok: false, error: 'not_owner' });
    live.doc.lastSeen[b.userId] = Date.now() - 8 * 24 * 60 * 60_000;
    // …but only for herself.
    const c = await join(app, roomId, user('eva'));
    expect(await op(a.s, { type: 'room.owner', to: c.userId })).toEqual({ ok: false, error: 'not_owner' });
    expect(await op(a.s, { type: 'room.owner', to: a.userId })).toMatchObject({ ok: true });
    expect(live.doc.state.createdBy).toBe(a.userId);
    expect(live.doc.state.activity.at(-1)).toMatchObject({ kind: 'owner', by: a.userId, to: a.userId });
  });
});

describe('series and movies', () => {
  it('creates rooms for anime, series, movies or all of them', async () => {
    const app = await start(await tmpDir());
    const info = async (id: string) => (await (await fetch(`${app.url}/api/rooms/${id}`)).json()) as { kind: string };
    expect((await info(await createRoom(app, 'Anime'))).kind).toBe('anime');
    for (const kind of ['series', 'movies', 'all']) expect((await info(await createRoom(app, kind, kind))).kind).toBe(kind);
    const bad = await fetch(`${app.url}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Livros', kind: 'books' }),
    });
    expect(bad.status).toBe(400);
  });

  it('a series room only takes series', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app, 'Séries da turma', 'series');
    const a = await join(app, roomId);
    expect(a.ack.state.kind).toBe('series');
    expect(await op(a.s, { type: 'anime.add', anime: title('tv', 1396, 'Breaking Bad') })).toMatchObject({ ok: true });
    expect(await op(a.s, { type: 'anime.add', anime: title('movie', 238, 'O Padrinho') })).toEqual({ ok: false, error: 'media_not_allowed' });
    expect(await op(a.s, { type: 'anime.add', anime: anime(1) })).toEqual({ ok: false, error: 'media_not_allowed' });
    // A title with a key that does not match its source is refused before reaching the room.
    expect(await op(a.s, { type: 'anime.add', anime: { ...title('tv', 5), key: 'al:5' } })).toMatchObject({ ok: false });
    expect(await op(a.s, { type: 'board.move', board: GROUP_BOARD, key: 'tv:1396', to: 's', index: 0 })).toMatchObject({ ok: true });
  });

  it('serves the TMDB catalogue without giving the key to the browsers', async () => {
    const tmdb = await startFakeTmdb();
    cleanups.push(tmdb.close);
    const app = await start(await tmpDir(), undefined, { tmdb: { key: FAKE_TMDB_KEY, baseUrl: tmdb.url } });
    const get = async (path: string) => {
      const res = await fetch(`${app.url}${path}`);
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    expect((await get('/api/catalogs')).body).toEqual({ anime: true, tmdb: true });

    const trending = await get('/api/tmdb/tv?sort=trending');
    expect(trending.status).toBe(200);
    expect(trending.body.items.length).toBeGreaterThan(3);
    expect(JSON.stringify(trending.body)).not.toContain(FAKE_TMDB_KEY);
    expect((await get('/api/tmdb/movie?search=origem')).body.items.map((i: { title: string }) => i.title)).toEqual(['A Origem']);
    expect((await get('/api/tmdb/movie?genre=16&page=1')).body.items.map((i: { key: string }) => i.key)).toEqual(['mv:12']);

    const details = await get('/api/tmdb/tv/1396');
    expect(details.body).toMatchObject({ seasons: 5, meta: { key: 'tv:1396', studio: 'AMC' } });
    expect((await get('/api/tmdb/movie/424242')).status).toBe(404);
    for (const bad of ['/api/tmdb/books', '/api/tmdb/tv?sort=random', '/api/tmdb/tv?page=0', '/api/tmdb/tv/abc']) {
      expect((await get(bad)).status).toBe(400);
    }
  });

  it('says clearly when the server has no (valid) TMDB key', async () => {
    const tmdb = await startFakeTmdb();
    cleanups.push(tmdb.close);
    const none = await start(await tmpDir());
    expect(await (await fetch(`${none.url}/api/catalogs`)).json()).toEqual({ anime: true, tmdb: false });
    const res = await fetch(`${none.url}/api/tmdb/tv`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'tmdb_not_configured' });

    const wrong = await start(await tmpDir(), undefined, { tmdb: { key: 'not-the-key', baseUrl: tmdb.url } });
    const res2 = await fetch(`${wrong.url}/api/tmdb/movie?sort=trending`);
    expect(res2.status).toBe(503);
    expect(await res2.json()).toEqual({ error: 'tmdb_key_invalid' });
  });
});
