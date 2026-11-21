import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

/**
 * Этап 7. Нагрузочные тесты K2 (API) на настоящих PostgreSQL и MinIO.
 *   NFR-02: 300 одновременных пользователей — без ошибок.
 *   NFR-03: 200 запросов в секунду — 95% ответов быстрее 500 мс.
 * Запуск: `npm run test:load` (поднимает отдельный API с лимитами для одного адреса — см. scripts/load.mjs).
 * Шифрование здесь не нужно: серверу всё равно, что внутри пакета, — он проверяет только структуру.
 */
const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8790';
const DURATION = __ENV.DURATION || '1m';

const b64 = (n) => encoding.b64encode(crypto.randomBytes(n), 'rawurl');
const makePackage = () =>
  JSON.stringify({
    v: 1,
    kdf: { alg: 'PBKDF2-SHA256', iterations: 600000, salt: b64(16) },
    cipher: { alg: 'AES-256-GCM', iv: b64(12) },
    ciphertext: b64(1024 + 16), // заметка ~1 КБ + тег GCM
  });
const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  scenarios: {
    // NFR-03: постоянный поток 200 rps (80% чтение, 20% создание)
    rps200: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 400,
      exec: 'mixed',
      tags: { nfr: 'NFR-03' },
    },
    // NFR-02: 300 пользователей одновременно (каждый открывает заметку раз в ~1 с)
    users300: {
      executor: 'ramping-vus',
      startTime: DURATION,
      stages: [
        { duration: '15s', target: 300 },
        { duration: DURATION, target: 300 },
        { duration: '5s', target: 0 },
      ],
      exec: 'reader',
      tags: { nfr: 'NFR-02' },
    },
  },
  thresholds: {
    'http_req_duration{nfr:NFR-03}': ['p(95)<500'],
    'http_req_failed{nfr:NFR-03}': ['rate<0.01'],
    'http_req_failed{nfr:NFR-02}': ['rate<0.01'],
    'http_req_duration{nfr:NFR-02}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
};

/** Заранее создаём заметки, которые будут читать. */
export function setup() {
  const ids = [];
  for (let i = 0; i < 50; i++) {
    const res = http.post(`${BASE}/api/notes?ttl=1`, makePackage(), JSON_HEADERS);
    if (res.status !== 201) throw new Error(`setup: ${res.status} ${res.body}`);
    ids.push(res.json('id'));
  }
  return { ids };
}

const pick = (ids) => ids[Math.floor(Math.random() * ids.length)];

export function mixed(data) {
  if (Math.random() < 0.2) {
    const res = http.post(`${BASE}/api/notes?ttl=1`, makePackage(), { ...JSON_HEADERS, tags: { name: 'POST /api/notes' } });
    check(res, { 'создание: 201': (r) => r.status === 201 });
  } else {
    const res = http.get(`${BASE}/api/notes/${pick(data.ids)}`, { tags: { name: 'GET /api/notes/:id' } });
    check(res, { 'чтение: 200': (r) => r.status === 200 });
  }
}

export function reader(data) {
  const res = http.get(`${BASE}/api/notes/${pick(data.ids)}`, { tags: { name: 'GET /api/notes/:id' } });
  check(res, { 'чтение: 200': (r) => r.status === 200 });
  sleep(1);
}
