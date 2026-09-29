import { existsSync } from 'node:fs';
import { APP_NAME } from '../shared/brand';
import { createApp } from './app';
import { lanAddresses } from './network';

// Optional settings file, e.g. DATABASE_URL=postgresql://… (real environment variables win).
if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';
const databaseUrl = process.env.DATABASE_URL?.trim() || undefined;
const tmdbOptions = { key: process.env.TMDB_API_KEY?.trim() || undefined, baseUrl: process.env.TMDB_API_URL?.trim() || undefined };
const admins = (process.env.ADMINS ?? '')
  .split(',')
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean);
const photosMaxMb = Number(process.env.PHOTOS_MAX_MB) > 0 ? Number(process.env.PHOTOS_MAX_MB) : undefined;
const google = {
  clientId: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
  // Several domains separated by commas (e.g. "lusiaves.pt,outra.pt").
  domains: (process.env.GOOGLE_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  certsUrl: process.env.GOOGLE_CERTS_URL?.trim() || undefined,
};

let app: Awaited<ReturnType<typeof createApp>>;
try {
  app = await createApp({
    dev,
    dataDir: process.env.DATA_DIR ?? 'data',
    databaseUrl,
    tmdb: tmdbOptions,
    communityCode: process.env.COMMUNITY_CODE,
    books: { baseUrl: process.env.OPENLIBRARY_URL?.trim() || undefined },
    places: { baseUrl: process.env.PHOTON_URL?.trim() || undefined },
    photosMaxMb,
    admins,
    google,
  });
} catch (err) {
  if (!databaseUrl) throw err;
  console.error('\n  ❌ Não foi possível ligar à base de dados (DATABASE_URL).');
  console.error(`     ${err instanceof Error ? err.message : String(err)}`);
  console.error('     Confirma o link no ficheiro .env, ou apaga essa linha para voltar a guardar na pasta data/.\n');
  process.exit(1);
}
const { httpServer, storage, tmdb, gate, imported, importedAccounts, close } = app;

httpServer.listen(port, host, () => {
  const lan = lanAddresses();
  const real = lan.filter((a) => !a.virtual);
  console.log(`\n  ✨ ${APP_NAME}${dev ? ' (dev)' : ''}`);
  console.log(`  ➜ Local:       http://localhost:${port}   (só funciona neste computador)`);
  real.forEach((a, i) =>
    console.log(`  ➜ Rede local:  http://${a.address}:${port}${i === 0 ? '   ← envia este aos colegas na mesma rede' : ''}`),
  );
  for (const a of lan.filter((x) => x.virtual)) {
    console.log(`    (virtual)    http://${a.address}:${port}   ${a.iface} — não serve para os colegas`);
  }
  console.log(`  ➜ Dados:       ${storage.label}`);
  if (imported) console.log(`                 (${imported} sala${imported === 1 ? '' : 's'} da pasta data/ copiada${imported === 1 ? '' : 's'} para a base de dados)`);
  if (importedAccounts) console.log(`                 (${importedAccounts} conta${importedAccounts === 1 ? '' : 's'} da pasta data/ copiada${importedAccounts === 1 ? '' : 's'} para a base de dados)`);
  console.log(
    tmdb.configured
      ? '  ➜ Séries e filmes: ativados (TMDB)'
      : '  ➜ Séries e filmes: desativados — falta TMDB_API_KEY no .env (vê o README)',
  );
  console.log(`  ➜ Fotos:       até ${photosMaxMb ?? 300} MB (PHOTOS_MAX_MB)${admins.length ? ` · moderação: ${admins.join(', ')}` : ''}`);
  const domains = google.domains.map((d) => `@${d}`).join(', ');
  console.log(
    google.clientId
      ? `  ➜ Google:      "Continuar com Google" ativado${domains ? ` (só contas ${domains})` : ' (qualquer conta Google: define GOOGLE_DOMAIN)'}`
      : `  ➜ Google:      desativado${domains ? ' — falta GOOGLE_CLIENT_ID (vê o README)' : ' (define GOOGLE_CLIENT_ID para entrar com a Google)'}`,
  );
  console.log(
    gate.enabled
      ? `  ➜ Acesso: só com o código da comunidade (COMMUNITY_CODE)${google.clientId && domains ? ` ou uma conta Google ${domains}` : ''}`
      : '  ➜ Acesso: aberto a quem tiver o link (define COMMUNITY_CODE para ser só para colaboradores)',
  );
  console.log(`\n  Colegas noutra rede? Cria um túnel:  cloudflared tunnel --url http://localhost:${port}\n`);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`\n[server] ${signal} — a guardar as salas…`);
  const force = setTimeout(() => process.exit(1), 8_000);
  force.unref();
  try {
    await close();
  } finally {
    httpServer.close();
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
