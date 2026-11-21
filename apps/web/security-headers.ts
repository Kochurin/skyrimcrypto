/**
 * Заголовки безопасности сайта (этап 5). Те же значения — в deploy/Caddyfile (продакшен).
 *
 * CSP:
 *  - скрипты, стили, шрифты, запросы — только с нашего адреса ('self'): никакого стороннего кода,
 *    который мог бы прочитать открытый текст заметки до шифрования;
 *  - встроенных <script> нет; inline-стили разрешены только как атрибуты style (их ставят анимации);
 *  - img-src data: — для SVG-шума на фоне;
 *  - require-trusted-types-for 'script' — браузер запрещает запись строк в innerHTML и подобные
 *    «опасные» места: даже если в коде появится ошибка, XSS через них не сработает;
 *  - frame-ancestors 'none' — сайт нельзя встроить в чужую страницу (кликджекинг).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
