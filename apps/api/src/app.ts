import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { isCryptoError } from '@cn/crypto';
import { MAX_ACCOUNT_PASSWORD, type AuthService, type SessionUser } from './auth.js';
import { ApiError, MAX_CIPHERTEXT_BYTES, type NotesService } from './notes.js';

/**
 * IF2 INotesApi (ЛР7): HTTP API сервера.
 *   POST   /api/notes          — сохранить зашифрованный пакет (F5 → F9); ?ttl=1|7|30
 *   GET    /api/notes/:id      — выдать пакет читателю (F10 → F13)
 *   GET    /api/notes          — список своих заметок (FR-06), нужен вход
 *   DELETE /api/notes/:id      — удалить свою заметку (FR-09), нужен вход
 *   POST   /api/auth/register | login | logout, GET /api/auth/me — учётные записи (FR-01)
 *   GET    /api/health         — состояние БД и хранилища (FR-11)
 */

/** base64url раздувает шифротекст в 4/3 раза, плюс заголовок JSON. */
export const BODY_LIMIT = Math.ceil((MAX_CIPHERTEXT_BYTES * 4) / 3) + 4096;
export const SESSION_COOKIE = 'sc_session';
export const SESSION_HOURS = 12;

export interface AppDeps {
  notes: NotesService;
  auth: AuthService;
  checks: Record<string, () => Promise<void>>;
  /** Секрет подписи JWT (HS256). */
  jwtSecret: string;
  /** Cookie только по HTTPS (в продакшене — true, этап 5). */
  cookieSecure?: boolean;
}

interface TokenPayload {
  sub: string;
  role: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['login', 'password'],
    properties: {
      login: { type: 'string', maxLength: 64 },
      password: { type: 'string', maxLength: MAX_ACCOUNT_PASSWORD * 4 },
    },
  },
} as const;

export function buildApp(deps: AppDeps, logger: FastifyServerOptions['logger'] = false): FastifyInstance {
  // Логгер Fastify пишет метод, путь и код ответа; тела запросов не пишет (FR-13).
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT });

  app.register(cookie);
  app.register(jwt, {
    secret: deps.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { algorithm: 'HS256', expiresIn: `${SESSION_HOURS}h` },
    verify: { algorithms: ['HS256'] },
  });

  // Ответы с заметками не должны оседать ни в каком кэше.
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (isCryptoError(err)) {
      return reply.code(400).send({ error: err.code, message: err.message });
    }
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413) {
      return reply.code(413).send({ error: 'TOO_LARGE', message: 'Заметка больше 10 МБ.' });
    }
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: 'BAD_REQUEST', message: 'Некорректный запрос.' });
    }
    req.log.error({ err }, 'необработанная ошибка');
    return reply.code(500).send({ error: 'INTERNAL', message: 'Внутренняя ошибка сервера.' });
  });

  /** Пользователь из cookie или null. Роль и существование проверяются по БД. */
  async function optionalUser(req: FastifyRequest): Promise<SessionUser | null> {
    if (!req.cookies[SESSION_COOKIE]) return null;
    try {
      const payload = await req.jwtVerify<TokenPayload>({ onlyCookie: true });
      return await deps.auth.current(payload.sub);
    } catch {
      return null;
    }
  }

  async function requireUser(req: FastifyRequest): Promise<SessionUser> {
    const user = await optionalUser(req);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Войдите в учётную запись.');
    return user;
  }

  async function startSession(reply: FastifyReply, user: SessionUser) {
    // JWT лежит в httpOnly-cookie: скрипты страницы (в том числе при XSS) его не прочитают.
    // SameSite=Strict — cookie не уходит с чужих сайтов (защита от CSRF).
    const token = await reply.jwtSign({ sub: user.id, role: user.role });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: deps.cookieSecure ?? false,
      path: '/api',
      maxAge: SESSION_HOURS * 3600,
    });
    return { login: user.login, role: user.role };
  }

  // ---------- Учётные записи (FR-01) ----------

  app.post<{ Body: { login: string; password: string } }>('/api/auth/register', { schema: credentialsSchema }, async (req, reply) => {
    const user = await deps.auth.register(req.body.login, req.body.password);
    return reply.code(201).send(await startSession(reply, user));
  });

  app.post<{ Body: { login: string; password: string } }>('/api/auth/login', { schema: credentialsSchema }, async (req, reply) => {
    const user = await deps.auth.login(req.body.login, req.body.password);
    return reply.send(await startSession(reply, user));
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/api' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await requireUser(req);
    return reply.send({ login: user.login, role: user.role });
  });

  // ---------- Заметки ----------

  app.post<{ Querystring: { ttl?: string } }>('/api/notes', async (req, reply) => {
    const user = await optionalUser(req);
    const ttlDays = req.query.ttl === undefined ? undefined : Number(req.query.ttl);
    const created = await deps.notes.create(req.body, {
      ownerId: user?.id ?? null,
      ...(ttlDays !== undefined ? { ttlDays } : {}),
    });
    return reply.code(201).send({ id: created.id, expiresAt: created.expiresAt.toISOString(), owned: user !== null });
  });

  app.get('/api/notes', async (req, reply) => {
    const user = await requireUser(req);
    const notes = await deps.notes.list(user.id);
    return reply.send({
      notes: notes.map((n) => ({
        id: n.id,
        sizeBytes: n.sizeBytes,
        createdAt: n.createdAt.toISOString(),
        expiresAt: n.expiresAt.toISOString(),
      })),
    });
  });

  app.get<{ Params: { id: string } }>('/api/notes/:id', async (req, reply) => {
    const pkg = await deps.notes.get(req.params.id);
    if (!pkg) {
      // Не уточняем, удалена ли заметка, истёк срок или её не было (FR-07).
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Заметка не найдена.' });
    }
    return reply.send(pkg);
  });

  app.delete<{ Params: { id: string } }>('/api/notes/:id', async (req, reply) => {
    const user = await requireUser(req);
    await deps.notes.delete(req.params.id, user.id);
    return reply.code(204).send();
  });

  // Кто открыл порт API в браузере — подсказываем, где сайт
  app.get('/', async (_req, reply) =>
    reply
      .type('text/plain; charset=utf-8')
      .send(['Это API SkyrimCrypto, а не сайт.', 'Сайт: http://127.0.0.1:5173 (запуск всего проекта: npm run dev или start.bat)', ''].join('\n')),
  );

  app.get('/api/health', async (req, reply) => {
    const result: Record<string, 'ok' | 'down'> = {};
    await Promise.all(
      Object.entries(deps.checks).map(async ([name, check]) => {
        try {
          await check();
          result[name] = 'ok';
        } catch (err) {
          req.log.error({ err, component: name }, 'health check failed');
          result[name] = 'down';
        }
      }),
    );
    const ok = Object.values(result).every((v) => v === 'ok');
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', ...result });
  });

  return app;
}
