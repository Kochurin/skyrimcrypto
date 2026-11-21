/**
 * Этап 7, PWA: регистрация service worker (public/sw.js) — только в собранной версии.
 * CSP требует Trusted Types: адрес скрипта воркера пропускаем через политику,
 * которая разрешает ровно один адрес — /sw.js.
 */
const SW_URL = '/sw.js';

interface TrustedTypesLike {
  createPolicy(name: string, rules: { createScriptURL(url: string): string }): { createScriptURL(url: string): unknown };
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const tt = (window as { trustedTypes?: TrustedTypesLike }).trustedTypes;
  const url = tt
    ? tt.createPolicy('sc-sw', {
        createScriptURL(u) {
          if (u !== SW_URL) throw new TypeError(`Запрещённый адрес service worker: ${u}`);
          return u;
        },
      }).createScriptURL(SW_URL)
    : SW_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url as string, { scope: '/' }).catch(() => undefined);
  });
}
