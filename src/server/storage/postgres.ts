import pg from 'pg';
import type { RoomDoc, Storage } from './types';

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

  async close() {
    await this.pool.end();
  }
}
