import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP, SECURITY_HEADERS } from './security-headers.js';

// K1.1 Веб-редактор. В разработке и в предпросмотре сборки запросы /api проксируются на K2 (apps/api).
// API_TARGET — другой адрес API (e2e-тесты поднимают свой сервер в памяти)
const api = { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:8787' };

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: api,
    // Без CSP: в режиме разработки Vite и React Refresh вставляют встроенные скрипты
    headers: SECURITY_HEADERS,
  },
  // `npm run preview -w @cn/web` — собранный сайт с той же CSP, что в продакшене
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: api,
    headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': CSP },
  },
  // assetsInlineLimit: 0 — шрифты отдельными файлами, а не data:-адресами (их запрещает CSP: font-src 'self')
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0 },
});
