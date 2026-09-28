import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import { apiRouter } from './http';
import { attachRealtime } from './realtime';
import { RoomManager, type RoomManagerOptions } from './rooms';
import { AccountManager } from './accounts';
import { accountRouter } from './account-routes';
import { catalogRouter } from './catalog-routes';
import { CommunityGate } from './community';
import { Tmdb, type TmdbOptions } from './tmdb';
import { createStorage, importFileAccounts, importFileRooms } from './storage';

export interface AppOptions {
  /** Serve the client through Vite (hot reload) instead of the built files. */
  dev: boolean;
  dataDir: string;
  databaseUrl?: string;
  clientDir?: string;
  rooms?: RoomManagerOptions;
  /** Series and movies catalogue (off without an API key) */
  tmdb?: TmdbOptions;
  /** When set, only people who know this code (colleagues) can use the app */
  communityCode?: string;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: https://graphql.anilist.co https://api.jikan.moe",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export async function createApp(opts: AppOptions) {
  const storage = createStorage(opts);
  try {
    await storage.init();
  } catch (err) {
    await storage.close().catch(() => {});
    throw err;
  }
  // Switching from JSON files to PostgreSQL: bring the rooms and accounts that already exist along.
  const imported = storage.kind === 'postgres' ? await importFileRooms(opts.dataDir, storage) : 0;
  const importedAccounts = storage.kind === 'postgres' ? await importFileAccounts(opts.dataDir, storage) : 0;
  const rooms = new RoomManager(storage, opts.rooms);
  const accounts = new AccountManager(storage);
  const tmdb = new Tmdb(opts.tmdb);
  const gate = new CommunityGate(opts.communityCode);

  const app = express();
  app.disable('x-powered-by');
  // Behind Render / Railway / Fly the client IP comes from X-Forwarded-For (sent by a private-network proxy).
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!opts.dev) res.setHeader('Content-Security-Policy', CSP);
    next();
  });
  app.use(compression());
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', gate.router());
  app.use('/api', gate.middleware());
  app.use('/api', accountRouter(accounts, rooms));
  app.use('/api', catalogRouter(tmdb));
  app.use('/api', apiRouter(rooms));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 256 * 1024,
    perMessageDeflate: { threshold: 4096 },
  });
  io.use((socket, next) => (gate.allows(socket.request.headers.cookie) ? next() : next(new Error('community_locked'))));
  attachRealtime(io, rooms, accounts);

  let closeVite: (() => Promise<void>) | undefined;
  if (opts.dev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, ws: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    closeVite = () => vite.close();
  } else {
    const clientDir = opts.clientDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
    const indexHtml = path.join(clientDir, 'index.html');
    if (!existsSync(indexHtml)) {
      console.warn(`[server] ${indexHtml} not found — run "npm run build" first.`);
    }
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders(res, filePath) {
          const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    // Single-page app: every other GET returns index.html (e.g. /r/abc123).
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/socket.io/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] request failed', err);
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
  });

  async function close() {
    io.close();
    await closeVite?.();
    await rooms.close();
    await storage.close();
  }

  return { app, httpServer, io, rooms, accounts, tmdb, gate, storage, imported, importedAccounts, close };
}
