import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoomState } from '../src/shared/ops';
import { importFileAccounts, importFileRooms, type AccountDoc, type RoomDoc, type Storage } from '../src/server/storage';
import { FileStorage } from '../src/server/storage/file';
import { normalizeConnectionString } from '../src/server/storage/postgres';

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

const doc = (id: string, name = id): RoomDoc => ({ v: 1, seq: 0, state: createRoomState(id, name, 0), secrets: {}, lastSeen: {} });

const account = (username: string, name = username): AccountDoc => ({
  v: 1,
  username,
  userId: `u_${username}_id`,
  secret: `${username}-secret-0123456789`,
  password: 'scrypt$16384$8$1$c2FsdA==$aGFzaA==',
  profile: { name, color: '#8b5cf6', avatar: '🦊' },
  rooms: {},
  createdAt: 0,
});

class MemoryStorage implements Storage {
  readonly kind = 'memory';
  readonly label = 'memory';
  rooms = new Map<string, RoomDoc>();
  accounts = new Map<string, AccountDoc>();
  async init() {}
  async load(id: string) {
    return this.rooms.get(id) ?? null;
  }
  async save(id: string, d: RoomDoc) {
    this.rooms.set(id, d);
  }
  async listedRooms() {
    return [];
  }
  async loadAccount(username: string) {
    return this.accounts.get(username) ?? null;
  }
  async createAccount(d: AccountDoc) {
    if (this.accounts.has(d.username)) return false;
    this.accounts.set(d.username, d);
    return true;
  }
  async saveAccount(d: AccountDoc) {
    this.accounts.set(d.username, d);
  }
  async savePhoto() {}
  async loadPhoto() {
    return null;
  }
  async deletePhotos() {}
  async photoBytes() {
    return 0;
  }
  async close() {}
}

describe('storage helpers', () => {
  it('lists the rooms saved as files and copies the missing ones to another storage', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-storage-'));
    dirs.push(dir);
    const files = new FileStorage(dir);
    expect(await files.list()).toEqual([]); // folder does not exist yet
    await files.init();
    await files.save('room0001', doc('room0001', 'Turma A'));
    await files.save('room0002', doc('room0002', 'Turma B'));
    await writeFile(path.join(dir, 'rooms', 'notes.txt'), 'ignore me');
    expect((await files.list()).sort()).toEqual(['room0001', 'room0002']);

    const target = new MemoryStorage();
    target.rooms.set('room0002', doc('room0002', 'Already in the database'));
    expect(await importFileRooms(dir, target)).toBe(1);
    expect(target.rooms.get('room0001')?.state.name).toBe('Turma A');
    // Existing rooms are never overwritten by the (older) files.
    expect(target.rooms.get('room0002')?.state.name).toBe('Already in the database');
    expect(await importFileRooms(dir, target)).toBe(0);
  });

  it('stores accounts as files, never lets two accounts share a username, and copies them to another storage', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-storage-'));
    dirs.push(dir);
    const files = new FileStorage(dir);
    expect(await files.listAccounts()).toEqual([]);
    await files.init();
    expect(await files.loadAccount('ana')).toBeNull();
    expect(await files.createAccount(account('ana', 'Ana'))).toBe(true);
    expect(await files.createAccount(account('ana', 'Impostor'))).toBe(false);
    expect((await files.loadAccount('ana'))?.profile.name).toBe('Ana');

    const updated = { ...account('ana', 'Ana Sofia'), rooms: { room0001: { name: 'Turma A', visitedAt: 5 } } };
    await files.saveAccount(updated);
    expect(await files.loadAccount('ana')).toEqual(updated);
    await files.createAccount(account('bruno'));
    await writeFile(path.join(dir, 'accounts', 'notes.txt'), 'ignore me');
    expect((await files.listAccounts()).sort()).toEqual(['ana', 'bruno']);
    // Usernames become file names: anything that is not a valid username is refused.
    await expect(files.loadAccount('../rooms/room0001')).rejects.toThrow('invalid username');

    const target = new MemoryStorage();
    target.accounts.set('bruno', account('bruno', 'Already in the database'));
    expect(await importFileAccounts(dir, target)).toBe(1);
    expect(target.accounts.get('ana')?.profile.name).toBe('Ana Sofia');
    expect(target.accounts.get('bruno')?.profile.name).toBe('Already in the database');
    expect(await importFileAccounts(dir, target)).toBe(0);
  });

  it('lists the rooms shown in the community rooms', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'atl-storage-'));
    dirs.push(dir);
    const files = new FileStorage(dir);
    await files.init();
    const open = doc('room0001', 'Aberta');
    open.state.listed = true;
    open.state.kind = 'movies';
    open.state.members.ana = { id: 'ana', name: 'Ana', color: '#ff0000', avatar: '🦊', joinedAt: 0 };
    await files.save('room0001', open);
    await files.save('room0002', doc('room0002', 'Privada'));
    const rows = await files.listedRooms();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'room0001', name: 'Aberta', kind: 'movies', members: 1, titles: 0 });
    expect(rows[0].updatedAt).toBeGreaterThan(0);
  });

  it('spells out sslmode=verify-full so node-postgres does not print a warning', () => {
    expect(normalizeConnectionString('postgresql://u:p@ep-x.neon.tech/db?sslmode=require')).toBe(
      'postgresql://u:p@ep-x.neon.tech/db?sslmode=verify-full',
    );
    expect(normalizeConnectionString('postgresql://u:p@h/db?sslmode=require&channel_binding=require')).toBe(
      'postgresql://u:p@h/db?sslmode=verify-full&channel_binding=require',
    );
    expect(normalizeConnectionString('postgresql://u:p@h/db?sslmode=no-verify')).toBe('postgresql://u:p@h/db?sslmode=no-verify');
    expect(normalizeConnectionString('postgresql://u:p@localhost/db')).toBe('postgresql://u:p@localhost/db');
  });
});
