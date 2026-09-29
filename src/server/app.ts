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
import { adminRouter } from './admin-routes';
import { catalogRouter } from './catalog-routes';
import { CommunityGate } from './community';
import { GoogleAuth, type GoogleOptions } from './google';
import { Tmdb, type TmdbOptions } from './tmdb';
import { Books, type BooksOptions } from './books';
import { Places, type PlacesOptions } from './places';
import { PHOTO_UPLOAD_PATH, photoRouter } from './photo-routes';
import { createStorage, importFileAccounts, importFileRooms } from './storage';
import { COMPANY } from '../shared/brand';

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
  /** Books catalogue (Open Library; for tests, another server) */
  books?: BooksOptions;
  /** Restaurants and places (Photon / OpenStreetMap; for tests, another server) */
  places?: PlacesOptions;
  /** Space for all the photos together, in MB (default 300: the free Neon database has 512 MB) */
  photosMaxMb?: number;
  /** Account usernames (or the emails of their Google accounts) that can remove any photo or title in the community */
  admins?: string[];
  /** Sign in with Google (off without a client id) */
  google?: GoogleOptions;
}

/** With Google sign-in on, the page may also load Google's button (script, styles and its frame). */
function contentSecurityPolicy(google: boolean) {
  const gsi = google ? ' https://accounts.google.com/gsi/' : '';
  return [
    "default-src 'self'",
    `script-src 'self'${google ? ' https://accounts.google.com/gsi/client' : ''}`,
    `style-src 'self' 'unsafe-inline'${google ? ' https://accounts.google.com/gsi/style' : ''}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ws: wss: https://graphql.anilist.co https://api.jikan.moe${gsi}`,
    ...(google ? [`frame-src${gsi}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

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
  await rooms.ensureCommunity(`Comunidade ${COMPANY}`);
  const accounts = new AccountManager(storage);
  const tmdb = new Tmdb(opts.tmdb);
  const books = new Books(opts.books);
  const places = new Places(opts.places);
  const gate = new CommunityGate(opts.communityCode);
  const google = new GoogleAuth(opts.google);
  const csp = contentSecurityPolicy(google.enabled);

  const app = express();
  app.disable('x-powered-by');
  // Behind Render / Railway / Fly the client IP comes from X-Forwarded-For (sent by a private-network proxy).
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!opts.dev) res.setHeader('Content-Security-Policy', csp);
    next();
  });
  app.use(compression());
  // Photo uploads have their own (bigger) limit.
  const smallJson = express.json({ limit: '64kb' });
  app.use((req, res, next) => (PHOTO_UPLOAD_PATH.test(req.path) ? next() : smallJson(req, res, next)));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 256 * 1024,
    perMessageDeflate: { threshold: 4096 },
  });
  io.use((socket, next) => (gate.allows(socket.request.headers.cookie) ? next() : next(new Error('community_locked'))));
  const admins = new Set(opts.admins ?? []);
  attachRealtime(io, rooms, accounts, admins);

  const publish = (room: Parameters<typeof rooms.apply>[0], op: Parameters<typeof rooms.apply>[1], by: string) => {
    const env = rooms.apply(room, op, by);
    io.to(room.id).emit('op', env);
    return env;
  };

  app.use('/api', gate.router());
  app.use('/api', gate.middleware());
  const photosMaxBytes = (opts.photosMaxMb ?? 300) * 1024 * 1024;
  app.use('/api', accountRouter(accounts, rooms, google, gate, admins));
  app.use(
    '/api',
    adminRouter({
      accounts,
      rooms,
      storage,
      admins,
      io,
      info: {
        google: google.publicConfig ? { domains: google.domains } : null,
        communityCode: gate.enabled,
        tmdb: tmdb.configured,
        admins: [...admins],
        photosMaxBytes,
      },
    }),
  );
  app.use('/api', catalogRouter(tmdb, books, places));
  app.use('/api', photoRouter(rooms, storage, { maxBytes: photosMaxBytes, publish }));
  app.use('/api', apiRouter(rooms));

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

  return { app, httpServer, io, rooms, accounts, tmdb, gate, google, storage, imported, importedAccounts, close };
}
