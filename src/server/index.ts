import { createApp } from './app';
import { lanAddresses } from './network';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

const { httpServer, storage, close } = await createApp({
  dev,
  dataDir: process.env.DATA_DIR ?? 'data',
  databaseUrl: process.env.DATABASE_URL || undefined,
});

httpServer.listen(port, host, () => {
  const lan = lanAddresses();
  const real = lan.filter((a) => !a.virtual);
  console.log(`\n  🎌 Anime Tierlist Live${dev ? ' (dev)' : ''}`);
  console.log(`  ➜ Local:       http://localhost:${port}   (só funciona neste computador)`);
  real.forEach((a, i) =>
    console.log(`  ➜ Rede local:  http://${a.address}:${port}${i === 0 ? '   ← envia este aos colegas na mesma rede' : ''}`),
  );
  for (const a of lan.filter((x) => x.virtual)) {
    console.log(`    (virtual)    http://${a.address}:${port}   ${a.iface} — não serve para os colegas`);
  }
  console.log(`  ➜ Dados:       ${storage.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'ficheiros JSON'}`);
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
