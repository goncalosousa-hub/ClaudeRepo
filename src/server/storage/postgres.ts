import pg from 'pg';
import type { CommunityRoom, RoomKind } from '../../shared/types';
import type { AccountDoc, RoomDoc, Storage, StoredPhoto } from './types';

/**
 * node-postgres currently treats `sslmode=require` (what Neon & co. put in their links) as
 * `verify-full` and prints a scary warning about it. Say `verify-full` explicitly: same behaviour,
 * no warning.
 */
export function normalizeConnectionString(url: string) {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, '$1verify-full');
}

/**
 * SSL is enabled for hosted databases (Neon, Supabase, Render…) unless the URL already says
 * what to do with `sslmode=…`. Local / private-network hosts connect without SSL.
 */
function sslOption(connectionString: string): pg.PoolConfig['ssl'] {
  if (/[?&]sslmode=/.test(connectionString)) return undefined;
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
  const privateHost =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.internal') || !host.includes('.');
  return privateHost ? undefined : { rejectUnauthorized: false };
}

/** Stores each room as a JSONB document. Enabled when DATABASE_URL is set. */
export class PostgresStorage implements Storage {
  readonly kind = 'postgres';
  readonly label: string;
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    const connectionString = normalizeConnectionString(databaseUrl.trim());
    let host = '?';
    try {
      host = new URL(connectionString).hostname;
    } catch {
      /* pg reports invalid URLs on connect */
    }
    this.label = `PostgreSQL (${host})`;
    this.pool = new pg.Pool({ connectionString, max: 4, ssl: sslOption(connectionString), connectionTimeoutMillis: 15_000 });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        doc JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        username TEXT PRIMARY KEY,
        doc JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        item_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data BYTEA NOT NULL,
        thumb BYTEA NOT NULL,
        bytes INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async load(id: string): Promise<RoomDoc | null> {
    const res = await this.pool.query<{ doc: RoomDoc }>('SELECT doc FROM rooms WHERE id = $1', [id]);
    return res.rows[0]?.doc ?? null;
  }

  async save(id: string, doc: RoomDoc) {
    await this.pool.query(
      `INSERT INTO rooms (id, doc) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [id, JSON.stringify(doc)],
    );
  }

  async listedRooms(): Promise<Omit<CommunityRoom, 'online'>[]> {
    const res = await this.pool.query<{ id: string; name: string; kind: string; members: number; titles: number; updated: string }>(
      `SELECT id,
              doc->'state'->>'name' AS name,
              COALESCE(doc->'state'->>'kind', 'anime') AS kind,
              (SELECT count(*) FROM jsonb_object_keys(COALESCE(doc->'state'->'members', '{}'::jsonb)))::int AS members,
              (SELECT count(*) FROM jsonb_object_keys(COALESCE(doc->'state'->'anime', '{}'::jsonb)))::int AS titles,
              (extract(epoch FROM updated_at) * 1000)::bigint AS updated
         FROM rooms
        WHERE doc->'state'->>'listed' = 'true'
        ORDER BY updated_at DESC
        LIMIT 1000`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as RoomKind,
      members: r.members,
      titles: r.titles,
      updatedAt: Number(r.updated),
    }));
  }

  async loadAccount(username: string): Promise<AccountDoc | null> {
    const res = await this.pool.query<{ doc: AccountDoc }>('SELECT doc FROM accounts WHERE username = $1', [username]);
    return res.rows[0]?.doc ?? null;
  }

  async createAccount(doc: AccountDoc) {
    const res = await this.pool.query(
      'INSERT INTO accounts (username, doc) VALUES ($1, $2::jsonb) ON CONFLICT (username) DO NOTHING',
      [doc.username, JSON.stringify(doc)],
    );
    return res.rowCount === 1;
  }

  async saveAccount(doc: AccountDoc) {
    await this.pool.query(
      `INSERT INTO accounts (username, doc) VALUES ($1, $2::jsonb)
       ON CONFLICT (username) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
      [doc.username, JSON.stringify(doc)],
    );
  }

  async savePhoto(p: StoredPhoto) {
    await this.pool.query(
      `INSERT INTO photos (id, room_id, item_key, user_id, data, thumb, bytes) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [p.id, p.roomId, p.key, p.userId, p.data, p.thumb, p.data.length + p.thumb.length],
    );
  }

  async loadPhoto(id: string, thumb: boolean) {
    const res = await this.pool.query<{ img: Buffer }>(`SELECT ${thumb ? 'thumb' : 'data'} AS img FROM photos WHERE id = $1`, [id]);
    return res.rows[0]?.img ?? null;
  }

  async deletePhotos(ids: string[]) {
    if (ids.length) await this.pool.query('DELETE FROM photos WHERE id = ANY($1::text[])', [ids]);
  }

  async photoBytes() {
    const res = await this.pool.query<{ total: string }>('SELECT COALESCE(SUM(bytes), 0)::bigint AS total FROM photos');
    return Number(res.rows[0]?.total ?? 0);
  }

  async close() {
    await this.pool.end();
  }
}
