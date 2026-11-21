// Этап 7: нагрузочный тест (NFR-02, NFR-03). Нужны Docker (PostgreSQL + MinIO) и k6.
// Поднимает отдельный экземпляр API на порту 8790 с теми же базой и хранилищем,
// но с лимитами запросов, рассчитанными на тест с одного адреса, — и запускает k6.
// Отчёт: load/report.json. Использование: npm run test:load [-- --duration 30s]
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8790;
const args = process.argv.slice(2);
const durIdx = args.indexOf('--duration');
const duration = durIdx >= 0 ? args[durIdx + 1] : '1m';
const win = process.platform === 'win32';

const api = spawn(win ? 'npx.cmd' : 'npx', ['tsx', 'apps/api/src/server.ts'], {
  env: {
    ...process.env,
    API_PORT: String(PORT),
    RATE_LIMIT_PER_MINUTE: '10000000',
    AUTH_RATE_LIMIT_PER_MINUTE: '10000000',
    PURGE_INTERVAL_MINUTES: '100000',
    BACKUP_INTERVAL_HOURS: '100000',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
  shell: win,
});

function stop(code) {
  if (win && api.pid) spawnSync('taskkill', ['/pid', String(api.pid), '/T', '/F'], { stdio: 'ignore' });
  else api.kill();
  process.exit(code);
}

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  await sleep(1000);
  ready = await fetch(`http://127.0.0.1:${PORT}/api/health`).then((r) => r.ok, () => false);
}
if (!ready) {
  console.error('API не поднялся: запущен ли Docker (docker compose up -d)?');
  stop(1);
}

const k6 = spawnSync(
  'k6',
  ['run', '--summary-export', 'load/report.json', '-e', `BASE_URL=http://127.0.0.1:${PORT}`, '-e', `DURATION=${duration}`, 'load/notes.k6.js'],
  { stdio: 'inherit', shell: win },
);
if (k6.error) console.error('k6 не найден: winget install GrafanaLabs.k6');
stop(k6.status ?? 1);
