#!/usr/bin/env node
/**
 * Запуск всего проекта одной командой: npm run dev (или двойной клик по start.bat).
 *  1. Поднимает PostgreSQL и MinIO (docker compose up -d) и ждёт, пока они будут готовы.
 *  2. Запускает API (порт 8787) — или берёт уже запущенный.
 *  3. Запускает сайт (порт 5173) и открывает его в браузере.
 * Ctrl+C останавливает API и сайт (контейнеры остаются работать — они лёгкие и нужны в следующий раз).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const API = 'http://127.0.0.1:8787';
const WEB = 'http://127.0.0.1:5173';
const OPEN = !process.argv.includes('--no-open');
/** Запущенные этим скриптом процессы (API, сайт) — их гасим при выходе и при ошибке. */
const children = [];
let stopping = false;

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const say = (s) => console.log(c('36', '[запуск]'), s);
const fail = (s) => {
  console.error(c('31', '[ошибка]'), s);
  stop(1);
};
/** Команда одной строкой (все аргументы — наши константы, без пользовательского ввода). */
const line = (cmd, args) => [cmd, ...args].join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ok(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function busy(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

// ---------- 1. Docker ----------

function dockerCmd() {
  // Docker Desktop добавляет себя в PATH, но уже открытые окна об этом не знают
  const bundled = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
  const probe = spawnSync(line('docker', ['--version']), { shell: true, stdio: 'ignore' });
  if (probe.status === 0) return 'docker';
  if (WIN && existsSync(bundled)) return `"${bundled}"`;
  return null;
}

const docker = dockerCmd();
if (!docker) fail('Docker не найден. Установите Docker Desktop и запустите его.');

say('Поднимаю PostgreSQL и MinIO (docker compose up -d)…');
const up = spawnSync(line(docker, ['compose', 'up', '-d']), { cwd: ROOT, shell: true, encoding: 'utf8' });
if (up.status !== 0) {
  const out = `${up.stdout ?? ''}${up.stderr ?? ''}`;
  if (/daemon|pipe|engine|cannot connect|не удается/i.test(out)) {
    fail('Docker Desktop не запущен. Откройте его (значок кита в трее), дождитесь «Engine running» и запустите снова.');
  }
  fail(`docker compose не сработал:\n${out}`);
}

// ---------- 2. API ----------

// Остановка: Ctrl+C гасит API и сайт вместе с их дочерними процессами

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else child.kill('SIGINT');
  }
  process.exit(code);
}

function run(name, color, args) {
  const child = spawn(line(WIN ? 'npm.cmd' : 'npm', args), { cwd: ROOT, shell: true, env: process.env });
  const prefix = c(color, `[${name}]`);
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) out.write(`${prefix} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(c('31', `[${name}] остановился (код ${code}). Останавливаю остальное.`));
      stop(1);
    }
  });
  children.push(child);
  return child;
}

if (await ok(`${API}/api/health`)) {
  say(`API уже запущен на ${API} — использую его`);
} else if (await busy(`${API}/api/health`)) {
  fail(`Порт 8787 занят, но это не наш API (или он сломан). Закройте окно, где он запущен, и попробуйте снова.`);
} else {
  say('Запускаю API (порт 8787)…');
  run('api', '35', ['run', 'dev', '-w', '@cn/api']);
  // База и MinIO могут ещё просыпаться — ждём до 60 секунд
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    await sleep(500);
    ready = await ok(`${API}/api/health`);
  }
  if (!ready) fail('API не ответил за минуту. Посмотрите сообщения [api] выше.');
  say('API готов');
}

// ---------- 3. Сайт ----------

if (await busy(WEB)) {
  say(`Сайт уже запущен на ${WEB}`);
} else {
  say('Запускаю сайт (порт 5173)…');
  run('web', '32', ['run', 'dev', '-w', '@cn/web']);
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await sleep(500);
    ready = await busy(WEB);
  }
  if (!ready) fail('Сайт не запустился за 30 секунд. Посмотрите сообщения [web] выше.');
}

console.log('');
console.log(c('1;32', `  SkyrimCrypto работает: ${WEB}`));
console.log(c('2', '  Остановить — Ctrl+C (или закрыть это окно)'));
console.log('');

if (OPEN) {
  if (WIN) spawn('cmd', ['/c', 'start', '', WEB], { stdio: 'ignore', detached: true }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [WEB], { stdio: 'ignore', detached: true }).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (children.length === 0) {
  say('Всё уже было запущено раньше — это окно можно закрыть');
  process.exit(0);
}
