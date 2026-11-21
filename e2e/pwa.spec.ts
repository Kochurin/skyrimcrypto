import { expect, test } from '@playwright/test';

/**
 * Этап 7, PWA: сайт устанавливается как приложение и открывается без сети.
 * Service worker кэширует только оболочку — ответы API в кэш не попадают (Zero-Knowledge).
 */
test.describe('PWA', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'проверка кэша service worker — в Chromium');

  test('манифест и иконки на месте', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    for (const icon of manifest.icons as { src: string }[]) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('без сети открывается оболочка; API в кэш не попадает', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload(); // теперь страница под управлением воркера, файлы сборки в кэше
    await expect(page.getByRole('button', { name: 'Зашифровать и сохранить' })).toBeVisible();

    // Создаём заметку — её шифротекст не должен осесть в кэше браузера
    await page.getByLabel('Текст', { exact: true }).fill('офлайн-проверка');
    await page.getByLabel('Пароль', { exact: true }).fill('pwa-password-1');
    await page.getByLabel('Пароль ещё раз', { exact: true }).fill('pwa-password-1');
    await page.getByRole('button', { name: 'Зашифровать и сохранить' }).click();
    const url = await page.getByLabel('Ссылка на заметку').inputValue();
    await page.goto(url);

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
      return urls;
    });
    expect(cached.length).toBeGreaterThan(0);
    expect(cached.filter((u) => u.includes('/api/'))).toEqual([]);

    await context.setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Зашифровать и сохранить' })).toBeVisible();
    await context.setOffline(false);
  });
});
