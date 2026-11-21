import { expect, test } from '@playwright/test';

/** Учётные записи (FR-01), вёрстка на телефоне и CSP в настоящих браузерах. */

test('регистрация → заметка появляется в «Моих заметках» → выход', async ({ page }) => {
  const login = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Регистрация' }).click();
  await page.getByLabel('Логин').fill(login);
  await page.getByLabel('Пароль учётной записи', { exact: true }).fill('e2e-account-pass');
  await page.getByLabel('Пароль ещё раз', { exact: true }).fill('e2e-account-pass');
  await page.getByRole('button', { name: 'Создать учётную запись' }).click();
  await expect(page.getByRole('heading', { name: 'Мои заметки' })).toBeVisible();

  await page.goto('/');
  await page.getByLabel('Текст', { exact: true }).fill('заметка учётной записи');
  await page.getByLabel('Пароль', { exact: true }).fill('note-password-1');
  await page.getByLabel('Пароль ещё раз', { exact: true }).fill('note-password-1');
  await page.getByRole('button', { name: 'Зашифровать и сохранить' }).click();
  await expect(page.getByLabel('Ссылка на заметку')).toHaveValue(/\/n\//);

  await page.goto('/notes');
  await expect(page.getByRole('list', { name: 'Список заметок' }).getByRole('listitem')).toHaveCount(1);
});

test('без горизонтальной прокрутки на любом экране', async ({ page }) => {
  for (const path of ['/', '/login']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.waitForTimeout(800); // анимации появления успели отработать
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `горизонтальная прокрутка на ${path}`).toBeLessThanOrEqual(0);
  }
});

test('CSP продакшена не ломает страницу и ничего не блокирует', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|CSP|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  const res = await page.goto('/');
  expect(res?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('button', { name: 'Зашифровать и сохранить' })).toBeVisible();
  await page.waitForLoadState('load');
  await page.waitForTimeout(800); // анимации появления успели отработать
  expect(violations).toEqual([]);
});
