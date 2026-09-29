import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { produce } from 'immer';
import { generateKeyPairSync } from 'node:crypto';
import { createApp } from '../src/server/app';
import { googleUsernames } from '../src/server/accounts';
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
import { FAKE_GOOGLE_CLIENT_ID, googleToken } from './fake-google';
import { FAKE_TMDB_KEY, startFakeTmdb } from './fake-tmdb';
import { anime, spot, title } from './fixtures';

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

async function join(app: App, roomId: string, u: ReturnType<typeof user> & { unit?: string } = user('ana')) {
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
  user: { id: string; secret: string; name: string; color: string; avatar: string; unit?: string; account: string };
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

async function communityRooms(app: App) {
  const res = await fetch(`${app.url}/api/community/rooms`);
  return ((await res.json()) as { rooms: { id: string; name: string; kind: string; members: number; titles: number; online: number }[] }).rooms;
}

async function createListedRoom(app: App, name: string, kind = 'anime') {
  const res = await fetch(`${app.url}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind, listed: true }),
  });
  return ((await res.json()) as { id: string }).id;
}

describe('community rooms', () => {
  it('lists the open rooms with who is in them, and only the owner opens or closes a room', async () => {
    const dir = await tmpDir();
    const app = await start(dir);
    const open = await createListedRoom(app, 'Filmes do mês', 'movies');
    const hidden = await createRoom(app, 'Só com link');
    expect((await communityRooms(app)).map((r) => r.id)).toEqual([open]);

    const a = await join(app, open, user('ana'));
    const b = await join(app, open, user('rui'));
    await op(a.s, { type: 'anime.add', anime: title('movie', 238, 'O Padrinho') });
    expect((await communityRooms(app))[0]).toMatchObject({ name: 'Filmes do mês', kind: 'movies', members: 2, titles: 1, online: 2 });

    // Only the owner decides who can find the room.
    expect(await op(b.s, { type: 'room.listed', listed: false })).toEqual({ ok: false, error: 'not_owner' });
    const h = await join(app, hidden, user('ana'));
    expect(await op(h.s, { type: 'room.listed', listed: true })).toMatchObject({ ok: true });
    expect((await communityRooms(app)).map((r) => r.id).sort()).toEqual([open, hidden].sort());
    expect(await op(a.s, { type: 'room.listed', listed: false })).toMatchObject({ ok: true });
    expect((await communityRooms(app)).map((r) => r.id)).toEqual([hidden]);
    a.s.disconnect();
    b.s.disconnect();
    h.s.disconnect();
    await app.close();

    // After a restart the list is read from what was saved.
    const again = await start(dir);
    expect((await communityRooms(again)).map((r) => [r.name, r.online])).toEqual([['Só com link', 0]]);
  });

  it.runIf(process.env.TEST_DATABASE_URL)('reads the community rooms from PostgreSQL', async () => {
    const url = process.env.TEST_DATABASE_URL!;
    const app1 = await start(await tmpDir(), url);
    const name = `Comunidade ${Date.now()}`;
    const id = await createListedRoom(app1, name, 'series');
    const a = await join(app1, id, user('ana'));
    await op(a.s, { type: 'anime.add', anime: title('tv', 1396, 'Breaking Bad') });
    a.s.disconnect();
    await app1.close();

    const app2 = await start(await tmpDir(), url);
    const found = (await communityRooms(app2)).find((r) => r.id === id);
    expect(found).toMatchObject({ name, kind: 'series', members: 1, titles: 1, online: 0 });
  });
});

describe('community space', () => {
  it('exists from the start, belongs to everyone and only lets people change what is theirs', async () => {
    const app = await start(await tmpDir());
    const info = await (await fetch(`${app.url}/api/rooms/comunidade`)).json();
    expect(info).toMatchObject({ id: 'comunidade', kind: 'all' });
    const a = await join(app, 'comunidade', user('ana'));
    const b = await join(app, 'comunidade', user('rui'));
    expect(a.ack.state).toMatchObject({ global: true, createdBy: null });

    // Each person adds titles, rates them and ranks them in their own tier list…
    expect(await op(a.s, { type: 'anime.add', anime: anime(5, 'Frieren'), place: { board: a.userId, to: 's' } })).toMatchObject({ ok: true });
    expect(await op(b.s, { type: 'review.set', key: 'al:5', patch: { rating: 9, recommend: 'yes', opinion: 'Top!' } })).toMatchObject({ ok: true });
    expect(await op(b.s, { type: 'board.move', board: b.userId, key: 'al:5', to: 'a', index: 0 })).toMatchObject({ ok: true });
    // …but there is no shared board to fight over, and the space itself is fixed.
    expect(await op(b.s, { type: 'board.move', board: GROUP_BOARD, key: 'al:5', to: 'f', index: 0 })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(b.s, { type: 'anime.add', anime: anime(6), place: { board: GROUP_BOARD, to: 's' } })).toEqual({ ok: false, error: 'forbidden' });
    for (const o of [
      { type: 'room.rename', name: 'A minha comunidade' },
      { type: 'room.listed', listed: true },
      { type: 'room.kind', kind: 'movies' },
      { type: 'room.owner', to: b.userId },
      { type: 'tiers.set', tiers: [{ id: 's', label: 'S', color: '#ff0000' }] },
    ]) {
      expect(await op(b.s, o)).toEqual({ ok: false, error: 'forbidden' });
    }
    // Only whoever added a title can take it out.
    expect(await op(b.s, { type: 'anime.remove', key: 'al:5' })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(a.s, { type: 'anime.remove', key: 'al:5' })).toMatchObject({ ok: true });

    // It never shows up in the community rooms nor in "As tuas salas".
    expect((await communityRooms(app)).map((r) => r.id)).not.toContain('comunidade');
    const eva = (await register(app, 'eva')).body;
    const s = client(app);
    expect((await emit<JoinAck>(s, 'join', { roomId: 'comunidade', user: eva.user, account: 'eva' })).ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await accountRooms(app, eva, 0)).toEqual([]);

    // Restarting does not create it again.
    const dir = await tmpDir();
    const app1 = await start(dir);
    const c = await join(app1, 'comunidade', user('ana'));
    await op(c.s, { type: 'chat.send', id: 'm1', text: 'Olá a todos' });
    c.s.disconnect();
    await app1.close();
    const app2 = await start(dir);
    const d = await join(app2, 'comunidade', user('rui'));
    expect(d.ack.state.chat.map((m) => m.text)).toEqual(['Olá a todos']);
  });
});

describe('community code', () => {
  it('keeps everyone without the code out of the API and the live rooms', async () => {
    const app = await start(await tmpDir(), undefined, { communityCode: 'frango-2026' });
    const call = (path: string, init: RequestInit = {}) => fetch(`${app.url}${path}`, init);
    expect((await call('/api/health')).status).toBe(200);
    expect(await (await call('/api/community/status')).json()).toEqual({ required: true, unlocked: false });
    const blocked = await call('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
    expect(blocked.status).toBe(401);
    expect(await blocked.json()).toEqual({ error: 'community_locked' });
    expect((await call('/api/community/rooms')).status).toBe(401);
    expect((await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(401);

    // Live connections are refused too.
    const outsider = connect(app.url, { transports: ['websocket'], forceNew: true, reconnection: false });
    cleanups.push(async () => void outsider.disconnect());
    expect(await new Promise((resolve) => outsider.on('connect_error', (err) => resolve(err.message)))).toBe('community_locked');

    const unlock = (code: string) =>
      call('/api/community/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const wrong = await unlock('galinha');
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const right = await unlock(' frango-2026 ');
    expect(right.status).toBe(200);
    const cookie = right.headers.get('set-cookie')!.split(';')[0];
    expect(right.headers.get('set-cookie')).toMatch(/HttpOnly/);

    // With the cookie everything works.
    expect(await (await call('/api/community/status', { headers: { cookie } })).json()).toEqual({ required: true, unlocked: true });
    const res = await call('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{"name":"Colegas"}' });
    expect(res.status).toBe(201);
    const { id: roomId } = (await res.json()) as { id: string };
    const colleague = connect(app.url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { cookie } });
    cleanups.push(async () => void colleague.disconnect());
    const ack = await emit<JoinAck>(colleague, 'join', { roomId, user: user('ana') });
    expect(ack.ok).toBe(true);
  });

  it('is off when no code is set', async () => {
    const app = await start(await tmpDir());
    expect(await (await fetch(`${app.url}/api/community/status`)).json()).toEqual({ required: false, unlocked: true });
  });
});

describe('sign in with Google', () => {
  type GoogleLogin = LoginResult & { created: boolean };

  /** An app with Google sign-in for lusiaves.pt (the fake Google keys come from the fake server). */
  async function withGoogle(extra: Partial<Parameters<typeof createApp>[0]> = {}, domains = ['lusiaves.pt']) {
    const fake = await startFakeTmdb();
    cleanups.push(fake.close);
    const app = await start(await tmpDir(), undefined, {
      google: { clientId: FAKE_GOOGLE_CLIENT_ID, domains, certsUrl: fake.googleCertsUrl },
      ...extra,
    });
    return { app, fake };
  }
  const google = (app: App, credential: string, extra: object = {}, headers: Record<string, string> = {}) =>
    fetch(`${app.url}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ credential, ...extra }),
    }).then(async (res) => ({ status: res.status, body: (await res.json()) as GoogleLogin & { error?: string }, res }));

  it('makes usernames from the email', () => {
    expect(googleUsernames('Ana.Sofia@lusiaves.pt').slice(0, 3)).toEqual(['ana.sofia', 'ana.sofia2', 'ana.sofia3']);
    expect(googleUsernames('joão.nuñez@lusiaves.pt')[0]).toBe('joao.nunez');
    expect(googleUsernames('.rui_costa.@lusiaves.pt')[0]).toBe('rui_costa');
    expect(googleUsernames('maria.dos.santos.ferreira@lusiaves.pt')[0]).toBe('maria.dos.santos.fer');
    expect(googleUsernames('jo@lusiaves.pt')[0]).toBe('colega');
    expect(googleUsernames('com1@lusiaves.pt')[0]).toBe('colega');
  });

  it('is off without a client id', async () => {
    const app = await start(await tmpDir());
    expect((await api(app, 'GET', '/api/auth/providers')).body).toEqual({ google: null });
    expect((await google(app, googleToken())).body).toEqual({ error: 'google_off' });
    expect((await fetch(`${app.url}/`)).headers.get('content-security-policy')).not.toContain('accounts.google.com');
  });

  it('creates an account on the first sign-in and signs in to the same one after', async () => {
    const { app, fake } = await withGoogle();
    expect((await api(app, 'GET', '/api/auth/providers')).body).toEqual({
      google: { clientId: FAKE_GOOGLE_CLIENT_ID, domains: ['lusiaves.pt'] },
    });
    // The page may load Google's button.
    const csp = (await fetch(`${app.url}/`)).headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client");
    expect(csp).toContain('frame-src https://accounts.google.com/gsi/');

    const first = await google(app, googleToken());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      created: true,
      username: 'ana.sofia',
      rooms: [],
      user: { name: 'Ana Sofia Pereira', avatar: '', account: 'ana.sofia' },
    });
    expect(first.res.headers.get('set-cookie')).toBeNull();
    const again = await google(app, googleToken());
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.user).toEqual(first.body.user);
    expect((await api(app, 'GET', '/api/account', undefined, auth(first.body))).body).toMatchObject({
      username: 'ana.sofia',
      google: 'ana.sofia@lusiaves.pt',
      password: false,
    });
    // No password: it only signs in with Google.
    expect(await login(app, 'ana.sofia', 'anything')).toEqual({ status: 401, body: { error: 'invalid_credentials' } });
    // The keys were fetched once.
    expect(fake.hits.filter((h) => h.startsWith('/google/certs'))).toHaveLength(1);

    // A taken username gets a number; a new email in Google is kept, the account stays the same.
    await register(app, 'rui.costa');
    const rui = await google(app, googleToken({ sub: '2002', email: 'rui.costa@lusiaves.pt', name: 'Rui Costa' }));
    expect(rui.body).toMatchObject({ created: true, username: 'rui.costa2', user: { name: 'Rui Costa' } });
    const renamed = await google(app, googleToken({ email: 'ana.pereira@lusiaves.pt' }));
    expect(renamed.body).toMatchObject({ created: false, username: 'ana.sofia' });
    expect((await api(app, 'GET', '/api/account', undefined, auth(first.body))).body).toMatchObject({ google: 'ana.pereira@lusiaves.pt' });
  });

  it('only takes tokens Google made for this app, for accounts of the company', async () => {
    const { app, fake } = await withGoogle();
    const now = Math.floor(Date.now() / 1000);
    const refused = async (credential: string) => {
      const r = await google(app, credential);
      return [r.status, r.body.error];
    };
    // Another domain, or a Google account that only uses a company email (not the company's Workspace).
    expect(await refused(googleToken({ hd: 'gmail.com', email: 'ana@gmail.com' }))).toEqual([403, 'wrong_domain']);
    expect(await refused(googleToken({ hd: undefined }))).toEqual([403, 'wrong_domain']);
    expect(await refused(googleToken({ aud: 'another-app.apps.googleusercontent.com' }))).toEqual([401, 'invalid_token']);
    expect(await refused(googleToken({ iss: 'https://evil.example' }))).toEqual([401, 'invalid_token']);
    expect(await refused(googleToken({ exp: now - 3600, iat: now - 7200 }))).toEqual([401, 'invalid_token']);
    expect(await refused(googleToken({ email_verified: false }))).toEqual([401, 'invalid_token']);
    const { privateKey: stranger } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(await refused(googleToken({}, { key: stranger }))).toEqual([401, 'invalid_token']);
    expect(await refused(googleToken({}, { kid: 'unknown-key' }))).toEqual([401, 'invalid_token']);
    const [head, body] = googleToken().split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'fake-google-key-1' })).toString('base64url')}.${body}.x`;
    expect(await refused(none)).toEqual([401, 'invalid_token']);
    expect(await refused(`${head}.${Buffer.from('{"sub":"1"}').toString('base64url')}.x`)).toEqual([401, 'invalid_token']);
    expect(await refused('not-a-token')).toEqual([400, 'invalid_request']);
    // Unknown keys do not make the server ask Google again and again.
    await refused(googleToken({}, { kid: 'another-unknown-key' }));
    expect(fake.hits.filter((h) => h.startsWith('/google/certs')).length).toBeLessThanOrEqual(2);
    // Nothing was created.
    expect((await google(app, googleToken())).body.created).toBe(true);
  });

  it('keeps the profile someone already uses in rooms', async () => {
    const { app } = await withGoogle();
    const guest = { ...user('ana', 'Aninhas'), unit: 'Savinor' };
    const roomId = await createRoom(app, 'Turma A');
    (await join(app, roomId, guest)).s.disconnect();
    const created = await google(app, googleToken(), {
      profile: { name: guest.name, color: guest.color, avatar: guest.avatar, unit: guest.unit },
      id: guest.id,
      secret: guest.secret,
      rooms: [{ id: roomId, visitedAt: 1000 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ id: guest.id, secret: guest.secret, name: 'Aninhas', unit: 'Savinor' });
    expect(created.body.rooms).toEqual([{ id: roomId, name: 'Turma A', visitedAt: 1000 }]);
    // A profile without a name gets the one from Google.
    const rui = await google(app, googleToken({ sub: '3003', email: 'rui@lusiaves.pt', name: 'Rui Costa' }), {
      profile: { name: '', color: '#ff0066', avatar: '🐙' },
    });
    expect(rui.body.user).toMatchObject({ name: 'Rui Costa', color: '#ff0066', avatar: '🐙' });
    // An identity must come with its secret.
    expect((await google(app, googleToken({ sub: '4004' }), { id: guest.id })).status).toBe(400);
  });

  it('links a Google account to an account with a password', async () => {
    const { app } = await withGoogle();
    const ana = (await register(app, 'ana')).body;
    const bruno = (await register(app, 'bruno')).body;
    const link = (r: LoginResult | null, credential: string) =>
      api(app, 'POST', '/api/account/google', { credential }, r ? auth(r) : undefined);

    expect((await link(null, googleToken())).status).toBe(401);
    expect(await link(ana, googleToken({ aud: 'x' }))).toEqual({ status: 401, body: { error: 'invalid_token' } });
    expect(await link(ana, googleToken())).toEqual({ status: 200, body: { ok: true, google: 'ana.sofia@lusiaves.pt' } });
    expect(await link(ana, googleToken())).toMatchObject({ status: 200 });
    expect((await api(app, 'GET', '/api/account', undefined, auth(ana))).body).toMatchObject({ google: 'ana.sofia@lusiaves.pt', password: true });

    // Google now signs in to the same account (and the password still works).
    const signed = await google(app, googleToken());
    expect(signed.body).toMatchObject({ created: false, username: 'ana' });
    expect(signed.body.user).toEqual(ana.user);
    expect((await login(app, 'ana')).status).toBe(200);

    expect(await link(bruno, googleToken())).toEqual({ status: 409, body: { error: 'google_taken' } });
    expect(await link(ana, googleToken({ sub: '5005', email: 'outra@lusiaves.pt' }))).toEqual({
      status: 409,
      body: { error: 'google_linked' },
    });
  });

  it('opens the app behind the community code for accounts of the company only', async () => {
    const { app } = await withGoogle({ communityCode: 'frango-2026' });
    expect((await api(app, 'GET', '/api/auth/providers')).body.google).toMatchObject({ domains: ['lusiaves.pt'] });
    const outsider = await google(app, googleToken({ hd: 'gmail.com', email: 'ana@gmail.com' }));
    expect(outsider.status).toBe(403);
    expect(outsider.res.headers.get('set-cookie')).toBeNull();

    const colleague = await google(app, googleToken());
    expect(colleague.status).toBe(201);
    const setCookie = colleague.res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^atl_access=.+HttpOnly/);
    const cookie = setCookie.split(';')[0];
    expect(await (await fetch(`${app.url}/api/community/status`, { headers: { cookie } })).json()).toEqual({
      required: true,
      unlocked: true,
    });

    // Without GOOGLE_DOMAIN any Google account would get in: then only the code opens it.
    const { app: open } = await withGoogle({ communityCode: 'frango-2026' }, []);
    expect(await google(open, googleToken({ hd: 'gmail.com' }))).toMatchObject({ status: 401, body: { error: 'community_locked' } });
    // Once in (with the code), any Google account can sign in there.
    const unlocked = await fetch(`${open.url}/api/community/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'frango-2026' }),
    });
    const openCookie = unlocked.headers.get('set-cookie')!.split(';')[0];
    expect((await google(open, googleToken({ hd: undefined, email: 'ana@gmail.com' }), {}, { cookie: openCookie })).status).toBe(201);
  });

  it.runIf(process.env.TEST_DATABASE_URL)('keeps the Google links in PostgreSQL', async () => {
    const fake = await startFakeTmdb();
    cleanups.push(fake.close);
    const dir = await tmpDir();
    const opts = { google: { clientId: FAKE_GOOGLE_CLIENT_ID, domains: ['lusiaves.pt'], certsUrl: fake.googleCertsUrl } };
    // The test database outlives the tests: a Google account of its own for each run.
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const token = googleToken({ sub: `pg${tag}`, email: `pg.${tag}@lusiaves.pt` });
    const app1 = await start(dir, process.env.TEST_DATABASE_URL, opts);
    const first = await google(app1, token);
    expect(first.body).toMatchObject({ created: true, username: `pg.${tag}` });
    await app1.close();
    const app2 = await start(dir, process.env.TEST_DATABASE_URL, opts);
    const again = await google(app2, token);
    expect(again.body).toMatchObject({ created: false, username: `pg.${tag}` });
    expect(again.body.user).toEqual(first.body.user);
  });

  it('lets ADMINS name the email of a Google account', async () => {
    const { app } = await withGoogle({ admins: ['ana.sofia@lusiaves.pt'] });
    const ana = (await google(app, googleToken())).body;
    const s = client(app);
    const joined = await emit<JoinAck>(s, 'join', { roomId: 'sitios', user: ana.user, account: ana.username });
    expect(joined.ok && joined.admin).toBe(true);
    const rui = (await register(app, 'rui')).body;
    const r = client(app);
    const other = await emit<JoinAck>(r, 'join', { roomId: 'sitios', user: rui.user, account: 'rui' });
    expect(other.ok && other.admin).toBeFalsy();
  });
});

describe('company or unit', () => {
  it('travels with the profile: rooms and accounts', async () => {
    const app = await start(await tmpDir());
    const roomId = await createRoom(app);
    const a = await join(app, roomId, { ...user('ana'), unit: '  Lusiaves, Marinha das Ondas ' });
    expect(a.ack.state.members[a.userId].unit).toBe('Lusiaves, Marinha das Ondas');
    expect(await op(a.s, { type: 'member.update', name: 'Ana', color: '#3366ff', avatar: '🦊', unit: 'x'.repeat(41) })).toEqual({
      ok: false,
      error: 'invalid_op',
    });

    const created = await register(app, 'ana', 'pass-1234', { unit: 'Leiria' });
    expect(created.body.user.unit).toBe('Leiria');
    const auth = { username: 'ana', secret: created.body.user.secret };
    expect((await api(app, 'PATCH', '/api/account', { ...profile('Ana'), unit: 'Coimbra' }, auth)).status).toBe(200);
    expect((await login(app, 'ana')).body.user.unit).toBe('Coimbra');
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
      body: JSON.stringify({ name: 'Receitas', kind: 'recipes' }),
    });
    expect(bad.status).toBe(400);
  });

  it('only the owner changes the room type, and only to one its titles fit', async () => {
    const app = await start(await tmpDir());
    const roomId = await createListedRoom(app, 'Sala da equipa', 'anime');
    const a = await join(app, roomId, user('ana'));
    const b = await join(app, roomId, user('rui'));
    expect(await op(a.s, { type: 'anime.add', anime: anime(1) })).toMatchObject({ ok: true });

    expect(await op(b.s, { type: 'room.kind', kind: 'all' })).toEqual({ ok: false, error: 'not_owner' });
    expect(await op(a.s, { type: 'room.kind', kind: 'movies' })).toEqual({ ok: false, error: 'kind_conflict' });
    expect(await op(a.s, { type: 'room.kind', kind: 'books' })).toMatchObject({ ok: false });
    const seen = next<OpEnvelope>(b.s, 'op', (e) => e.op.type === 'room.kind');
    expect(await op(a.s, { type: 'room.kind', kind: 'all' })).toMatchObject({ ok: true });
    expect((await seen).op).toEqual({ type: 'room.kind', kind: 'all' });

    // Now films go in too, and the room says so everywhere.
    expect(await op(b.s, { type: 'anime.add', anime: title('movie', 238, 'O Padrinho') })).toMatchObject({ ok: true });
    expect((await (await fetch(`${app.url}/api/rooms/${roomId}`)).json()).kind).toBe('all');
    expect((await communityRooms(app))[0]).toMatchObject({ id: roomId, kind: 'all', titles: 2 });
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
    expect((await get('/api/catalogs')).body).toEqual({ anime: true, tmdb: true, books: true, places: true });

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
    expect(await (await fetch(`${none.url}/api/catalogs`)).json()).toEqual({ anime: true, tmdb: false, books: true, places: true });
    const res = await fetch(`${none.url}/api/tmdb/tv`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'tmdb_not_configured' });

    const wrong = await start(await tmpDir(), undefined, { tmdb: { key: 'not-the-key', baseUrl: tmdb.url } });
    const res2 = await fetch(`${wrong.url}/api/tmdb/movie?sort=trending`);
    expect(res2.status).toBe(503);
    expect(await res2.json()).toEqual({ error: 'tmdb_key_invalid' });
  });
});

describe('books, restaurants and places', () => {
  async function withCatalogs() {
    const fake = await startFakeTmdb();
    cleanups.push(fake.close);
    const app = await start(await tmpDir(), undefined, { books: { baseUrl: fake.openLibraryUrl }, places: { baseUrl: fake.photonUrl } });
    const get = async (p: string) => {
      const res = await fetch(`${app.url}${p}`);
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    return { app, get };
  }
  const titles = (r: { body: Record<string, any> }) => r.body.items.map((i: { title: string }) => i.title);

  it('the community has a space for each category', async () => {
    const app = await start(await tmpDir());
    for (const [id, kind] of [
      ['comunidade', 'all'],
      ['livros', 'books'],
      ['restaurantes', 'restaurants'],
      ['sitios', 'places'],
    ]) {
      expect(await (await fetch(`${app.url}/api/rooms/${id}`)).json()).toMatchObject({ id, kind });
    }
    const a = await join(app, 'restaurantes', user('ana'));
    expect(a.ack.state).toMatchObject({ global: true, createdBy: null, kind: 'restaurants' });
    expect(await op(a.s, { type: 'anime.add', anime: spot('restaurant', 'xtascadoze1', 'Tasca do Zé') })).toMatchObject({ ok: true });
    expect(await op(a.s, { type: 'anime.add', anime: anime(1) })).toEqual({ ok: false, error: 'media_not_allowed' });
    // Places added by hand: the same name in the same town only once.
    expect(await op(a.s, { type: 'anime.add', anime: spot('restaurant', 'xtascadoze2', 'tasca do ze') })).toEqual({
      ok: false,
      error: 'already_in_room',
    });
  });

  it('finds books on Open Library', async () => {
    const { get } = await withCatalogs();
    expect((await get('/api/catalogs')).body).toMatchObject({ books: true, places: true });
    const trending = await get('/api/books');
    expect(titles(trending)).toContain('Os Maias');
    expect(trending.body.items.find((b: { key: string }) => b.key === 'bk:1001')).toMatchObject({
      studio: 'Eça de Queirós',
      year: 1888,
      episodes: 716,
      cover: 'https://covers.openlibrary.org/b/id/501-M.jpg',
      genres: ['Classics'],
      score: 82,
      url: 'https://openlibrary.org/works/OL1001W',
    });
    // No cover: still a book (the app draws one).
    expect(trending.body.items.find((b: { key: string }) => b.key === 'bk:1005')).toMatchObject({ cover: '', score: null });
    expect(titles(await get('/api/books?search=saramago'))).toEqual(['Ensaio sobre a Cegueira']);
    expect(titles(await get('/api/books?sort=portuguese'))).toEqual(['Os Maias', 'Ensaio sobre a Cegueira', 'Livro sem capa']);
    expect(titles(await get('/api/books?subject=fantasy'))).toEqual(['O Senhor dos Anéis']);

    const maias = await get('/api/books/1001');
    expect(maias.body.synopsis).toBe('A história de três gerações da família Maia.');
    expect(maias.body.coverLarge).toBe('https://covers.openlibrary.org/b/id/501-L.jpg');
    expect((await get('/api/books/1002')).body.synopsis).toBe('Uma epidemia de cegueira branca.');
    expect((await get('/api/books/999')).status).toBe(404);
    for (const bad of ['/api/books?subject=cooking', '/api/books?sort=random', '/api/books/abc']) expect((await get(bad)).status).toBe(400);
  });

  it('finds restaurants and places on the map (OpenStreetMap)', async () => {
    const { get } = await withCatalogs();
    const food = await get('/api/places/restaurant?search=leiria');
    expect(titles(food)).toEqual(['Tasca do Zé', 'Café Central']);
    expect(food.body.items[0]).toMatchObject({
      key: 'rs:n1234567890',
      source: 'osm',
      format: 'restaurant',
      cover: '',
      url: 'https://www.openstreetmap.org/node/1234567890',
      place: { address: 'Rua Direita 12', city: 'Leiria', lat: 39.743, lon: -8.807 },
    });
    // Places to visit: the castle, not the tourist office nor the restaurants.
    const visit = await get('/api/places/place?search=leiria');
    expect(titles(visit)).toEqual(['Castelo de Leiria']);
    expect(visit.body.items[0].key).toBe('pl:r555');
    for (const bad of ['/api/places/hotel?search=leiria', '/api/places/place?search=a', '/api/places/place']) {
      expect((await get(bad)).status).toBe(400);
    }
  });
});

describe('photos', () => {
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
  const THUMB = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 3)]);

  const upload = async (app: App, roomId: string, u: ReturnType<typeof user>, key: string, image = JPEG) => {
    const res = await fetch(`${app.url}/api/rooms/${roomId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Member ${u.id}:${u.secret}` },
      body: JSON.stringify({ key, image: `data:image/jpeg;base64,${image.toString('base64')}`, thumb: THUMB.toString('base64'), w: 1280, h: 960 }),
    });
    return { status: res.status, body: (await res.json()) as { id?: string; error?: string } };
  };

  it('members add photos to a title; everyone sees them live; whoever added one (or the owner) removes it', async () => {
    const dir = await tmpDir();
    const app = await start(dir);
    const roomId = await createRoom(app, 'Almoços', 'restaurants');
    const ana = user('ana');
    const rui = user('rui');
    const eva = user('eva');
    const a = await join(app, roomId, ana);
    const r = await join(app, roomId, rui);
    await join(app, roomId, eva);
    await op(a.s, { type: 'anime.add', anime: spot('restaurant', 1, 'Tasca do Zé') });

    const seen = next<OpEnvelope>(r.s, 'op', (e) => e.op.type === 'photo.add');
    const added = await upload(app, roomId, rui, 'rs:n1');
    expect(added.status).toBe(201);
    const id = added.body.id!;
    expect((await seen).op).toEqual({ type: 'photo.add', key: 'rs:n1', photo: { id, w: 1280, h: 960 } });

    const full = await fetch(`${app.url}/api/photos/${id}`);
    expect(full.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await full.arrayBuffer()).equals(JPEG)).toBe(true);
    expect(Buffer.from(await (await fetch(`${app.url}/api/photos/${id}/thumb`)).arrayBuffer()).equals(THUMB)).toBe(true);
    expect((await fetch(`${app.url}/api/photos/${'x'.repeat(21)}`)).status).toBe(404);

    // Only members, only real JPEGs, only titles in the room.
    expect((await upload(app, roomId, user('ze'), 'rs:n1')).status).toBe(403);
    expect((await upload(app, roomId, { ...ana, secret: 'wrong-secret-0123456789' }, 'rs:n1')).status).toBe(403);
    expect((await upload(app, roomId, ana, 'rs:n1', Buffer.from('<svg onload=alert(1)>'))).body.error).toBe('invalid_image');
    expect((await upload(app, roomId, ana, 'rs:n2')).status).toBe(404);

    // Eva cannot remove Rui's photo; Ana owns the room and can. The image goes with it.
    const v = await join(app, roomId, eva);
    expect(await op(v.s, { type: 'photo.remove', key: 'rs:n1', id })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(a.s, { type: 'photo.remove', key: 'rs:n1', id })).toMatchObject({ ok: true });
    await waitFor(async () => (await fetch(`${app.url}/api/photos/${id}`)).status === 404);

    // Removing a title removes its photos too.
    const second = (await upload(app, roomId, rui, 'rs:n1')).body.id!;
    expect(await op(r.s, { type: 'photo.remove', key: 'rs:n1', id: second })).toMatchObject({ ok: true });
    const third = (await upload(app, roomId, eva, 'rs:n1')).body.id!;
    expect(await op(a.s, { type: 'anime.remove', key: 'rs:n1' })).toMatchObject({ ok: true });
    await waitFor(async () => (await fetch(`${app.url}/api/photos/${third}`)).status === 404);
  });

  it('in the community only whoever added a photo removes it, or an admin (ADMINS)', async () => {
    const app = await start(await tmpDir(), undefined, { admins: ['mod'] });
    const ana = user('ana');
    const a = await join(app, 'sitios', ana);
    await op(a.s, { type: 'anime.add', anime: spot('place', 444, 'Praia da Tocha') });
    const id = (await upload(app, 'sitios', ana, 'pl:n444')).body.id!;

    const rui = await join(app, 'sitios', user('rui'));
    expect(await op(rui.s, { type: 'photo.remove', key: 'pl:n444', id })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(rui.s, { type: 'anime.remove', key: 'pl:n444' })).toEqual({ ok: false, error: 'forbidden' });

    // Saying you are the admin is not enough: the account has to be yours.
    const mod = (await register(app, 'mod')).body;
    const fake = client(app);
    const faked = await emit<JoinAck>(fake, 'join', { roomId: 'sitios', user: user('ze'), account: 'mod' });
    expect(faked.ok && faked.admin).toBeFalsy();
    const m = client(app);
    const joined = await emit<JoinAck>(m, 'join', { roomId: 'sitios', user: mod.user, account: 'mod' });
    expect(joined.ok && joined.admin).toBe(true);
    expect(await op(fake, { type: 'photo.remove', key: 'pl:n444', id })).toEqual({ ok: false, error: 'forbidden' });
    expect(await op(m, { type: 'photo.remove', key: 'pl:n444', id })).toMatchObject({ ok: true });
    expect(await op(m, { type: 'anime.remove', key: 'pl:n444' })).toMatchObject({ ok: true });
  });

  it('keeps photos within their space budget (PHOTOS_MAX_MB), in PostgreSQL too', async () => {
    // The test database may already hold photos from other runs: 5 KB more than those.
    const dir = await tmpDir();
    const probe = await start(dir, process.env.TEST_DATABASE_URL);
    const used = await probe.storage.photoBytes();
    await probe.close();
    const app = await start(dir, process.env.TEST_DATABASE_URL, { photosMaxMb: (used + 5000) / 1024 / 1024 });
    const roomId = await createRoom(app, 'Sítios', 'places');
    const ana = user('ana');
    const a = await join(app, roomId, ana);
    await op(a.s, { type: 'anime.add', anime: spot('place', 555, 'Castelo de Leiria') });
    const first = await upload(app, roomId, ana, 'pl:n555');
    expect(first.status).toBe(201);
    expect(Buffer.from(await (await fetch(`${app.url}/api/photos/${first.body.id}`)).arrayBuffer()).equals(JPEG)).toBe(true);
    expect(await upload(app, roomId, ana, 'pl:n555')).toEqual({ status: 201, body: expect.objectContaining({ id: expect.any(String) }) });
    // 5 KB: the third one does not fit.
    expect(await upload(app, roomId, ana, 'pl:n555')).toEqual({ status: 507, body: { error: 'photos_full' } });
  });
});

async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('condition never became true');
}
