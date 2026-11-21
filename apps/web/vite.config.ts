import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// K1.1 Веб-редактор. В разработке запросы /api проксируются на K2 (apps/api).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022', sourcemap: true },
});
