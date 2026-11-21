import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { isCryptoError } from '@cn/crypto';
import { ApiError, MAX_CIPHERTEXT_BYTES, type NotesService } from './notes.js';

/**
 * IF2 INotesApi (ЛР7): HTTP API сервера.
 *   POST /api/notes      — сохранить зашифрованный пакет (F5 → F9)
 *   GET  /api/notes/:id  — выдать пакет читателю (F10 → F13)
 *   GET  /api/health     — состояние БД и хранилища (FR-11)
 */

/** base64url раздувает шифротекст в 4/3 раза, плюс заголовок JSON. */
export const BODY_LIMIT = Math.ceil((MAX_CIPHERTEXT_BYTES * 4) / 3) + 4096;

export interface AppDeps {
  notes: NotesService;
  checks: Record<string, () => Promise<void>>;
}

export function buildApp(deps: AppDeps, logger: FastifyServerOptions['logger'] = false): FastifyInstance {
  // Логгер Fastify пишет метод, путь и код ответа; тела запросов не пишет (FR-13).
  const app = Fastify({ logger, bodyLimit: BODY_LIMIT });

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

  app.post('/api/notes', async (req, reply) => {
    const created = await deps.notes.create(req.body);
    return reply.code(201).send({ id: created.id, expiresAt: created.expiresAt.toISOString() });
  });

  app.get<{ Params: { id: string } }>('/api/notes/:id', async (req, reply) => {
    const pkg = await deps.notes.get(req.params.id);
    if (!pkg) {
      // Не уточняем, удалена ли заметка, истёк срок или её не было (FR-07).
      return reply.code(404).send({ error: 'NOT_FOUND', message: 'Заметка не найдена.' });
    }
    return reply.send(pkg);
  });

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
