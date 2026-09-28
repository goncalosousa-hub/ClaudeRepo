import os from 'node:os';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

const { httpServer, storage, close } = await createApp({
  dev,
  dataDir: process.env.DATA_DIR ?? 'data',
  databaseUrl: process.env.DATABASE_URL || undefined,
});

httpServer.listen(port, host, () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}:${port}`);
  console.log(`\n  🎌 Anime Tierlist Live${dev ? ' (dev)' : ''}`);
  console.log(`  ➜ Local:       http://localhost:${port}`);
  for (const url of lan) console.log(`  ➜ Rede local:  ${url}`);
  console.log(`  ➜ Dados:       ${storage.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'ficheiros JSON'}\n`);
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
