import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `npm run dev` behind a tunnel (to play with colleagues on other networks).
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.ngrok.io', '.loca.lt'],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
});
