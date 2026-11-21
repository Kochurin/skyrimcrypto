/**
 * Назначить роль учётной записи (FR-01): npm run set-role -- <логин> <author|auditor|admin>
 * Нужна, чтобы назначить первого администратора — дальше роли раздаются в разделе «Администрирование».
 */
import { loadConfig } from '../config.js';
import { PostgresMetadataStore } from '../stores/postgres.js';
import { ROLES, type Role } from '../stores/types.js';

const [login, role] = process.argv.slice(2);
if (!login || !role || !(ROLES as readonly string[]).includes(role)) {
  console.error(`Использование: npm run set-role -- <логин> <${ROLES.join('|')}>`);
  process.exit(2);
}

const db = PostgresMetadataStore.connect(loadConfig().databaseUrl);
try {
  await db.migrate();
  const ok = await db.setRole(login.trim().toLowerCase(), role as Role);
  if (!ok) {
    console.error(`Нет учётной записи «${login}». Сначала зарегистрируйтесь на сайте.`);
    process.exitCode = 1;
  } else {
    console.log(`Готово: ${login} — ${role}. Обновите страницу сайта.`);
  }
} finally {
  await db.close();
}
