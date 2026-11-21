import { expect, test, type Page } from '@playwright/test';

/**
 * US-01 «Создать и зашифровать заметку» и US-02 «Открыть заметку по ссылке» —
 * в настоящих браузерах, против настоящего API, на сборке с продакшен-CSP.
 */
const PASSWORD = 'e2e-correct-horse';

async function createNote(page: Page, title: string, text: string): Promise<{ url: string; sent: string[] }> {
  const sent: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/')) sent.push(`${req.url()}\n${JSON.stringify(req.headers())}\n${req.postData() ?? ''}`);
  });
  await page.goto('/');
  if (title) await page.getByLabel('Название').fill(title);
  await page.getByLabel('Текст', { exact: true }).fill(text);
  await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Пароль ещё раз', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Зашифровать и сохранить' }).click();
  const link = page.getByLabel('Ссылка на заметку');
  await expect(link).toHaveValue(/\/n\/[0-9a-f-]{36}$/);
  return { url: await link.inputValue(), sent };
}

test.describe('US-01: создать и зашифровать', () => {
  test('в сеть уходит только шифротекст — ни текста, ни названия, ни пароля', async ({ page }) => {
    const { sent } = await createNote(page, 'Пароли от Wi-Fi', 'секрет e2e: 12345');
    const posts = sent.filter((s) => s.includes('"ciphertext"'));
    expect(posts).toHaveLength(1);
    for (const req of sent) {
      expect(req).not.toContain('секрет');
      expect(req).not.toContain('Wi-Fi');
      expect(req).not.toContain(PASSWORD);
    }
  });

  test('пароли не совпадают — ничего не отправляется', async ({ page }) => {
    let posted = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/notes')) posted = true;
    });
    await page.goto('/');
    await page.getByLabel('Текст', { exact: true }).fill('текст');
    await page.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Пароль ещё раз', { exact: true }).fill(`${PASSWORD}!`);
    await page.getByRole('button', { name: 'Зашифровать и сохранить' }).click();
    await expect(page.getByRole('alert')).toContainText('Пароли не совпадают');
    expect(posted).toBe(false);
  });
});

test.describe('US-02: открыть по ссылке', () => {
  test('другой браузер, верный пароль — текст расшифрован, HTML не исполняется', async ({ page, browser }) => {
    const { url } = await createNote(page, 'Мой план', '<img src=x onerror="window.pwned=1"> строка');

    // Получатель — чистый профиль: ни cookie, ни памяти отправителя
    const other = await browser.newContext();
    const reader = await other.newPage();
    await reader.goto(url);
    await reader.getByLabel('Пароль', { exact: true }).fill(PASSWORD);
    await reader.getByRole('button', { name: 'Расшифровать' }).click();
    await expect(reader.getByRole('heading', { name: 'Мой план' })).toBeVisible();
    await expect(reader.getByText('<img src=x onerror="window.pwned=1"> строка')).toBeVisible();
    expect(await reader.evaluate(() => (window as { pwned?: number }).pwned)).toBeUndefined();
    await other.close();
  });

  test('неверный пароль — отказ, затем верный открывает', async ({ page }) => {
    const { url } = await createNote(page, '', 'вторая попытка');
    await page.goto(url);
    const field = page.getByLabel('Пароль', { exact: true });
    await field.fill('wrong-password-1');
    await page.getByRole('button', { name: 'Расшифровать' }).click();
    await expect(page.getByRole('alert')).toContainText('Неверный пароль');
    await field.fill(PASSWORD);
    await page.getByRole('button', { name: 'Расшифровать' }).click();
    await expect(page.getByText('вторая попытка')).toBeVisible();
  });

  test('несуществующая заметка — понятное сообщение', async ({ page }) => {
    await page.goto('/n/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText(/не найдена|удалена|истёк/i).first()).toBeVisible();
  });
});
