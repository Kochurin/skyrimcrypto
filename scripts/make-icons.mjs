// Иконки PWA из логотипа-замка (этап 7). Рисует SVG в Chromium из Playwright и сохраняет PNG.
// Запуск: node scripts/make-icons.mjs  → apps/web/public/icons/
import { chromium } from '@playwright/test';

const OUT = 'apps/web/public/icons';
// maskable: без скругления и с полями — система сама обрежет иконку по своей форме
const lock = (maskable) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" ${maskable ? '' : 'rx="7"'} fill="#151513"/>` +
  `<g transform="translate(16 16) scale(${maskable ? 0.72 : 1}) translate(-16 -16)">` +
  `<rect x="9" y="14" width="14" height="11" rx="2" fill="#fff"/>` +
  `<path d="M12 14v-3a4 4 0 0 1 8 0v3" stroke="#fff" stroke-width="2.4" fill="none"/></g></svg>`;

const ICONS = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, maskable] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${lock(maskable)}`);
  await page.screenshot({ path: `${OUT}/${name}`, omitBackground: true });
  console.log(`${OUT}/${name}`);
}
await browser.close();
