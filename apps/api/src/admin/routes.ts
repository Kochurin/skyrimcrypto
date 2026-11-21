import { isIP } from 'node:net';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SessionUser } from '../auth.js';
import { ApiError } from '../notes.js';
import type { SecurityLog } from '../security/audit.js';
import type { SecurityGuard } from '../security/guard.js';
import type { ISecurityEventStore } from '../security/types.js';
import { ROLES, type IMetadataStore, type IUserStore, type Role } from '../stores/types.js';
import { parseReport, type IAuditReportStore } from './audit-reports.js';
import type { BackupService } from './backup.js';
import type { ReconcileReport } from './reconcile.js';
import type { SettingsService } from './settings.js';

/**
 * Этап 6: разделы администратора и аудитора (ЛР6: FR-10, FR-11, FR-12, FR-13, FR-14; US-03, US-04).
 *   /api/admin/*  — только роль admin (журнал — ещё и auditor)
 *   /api/audit/*  — роли auditor и admin
 * Каждое действие администратора пишется в журнал безопасности (FR-10: «действие пишется в журнал»).
 */
export interface AdminDeps {
  settings: SettingsService;
  backups: BackupService;
  reconcile: () => Promise<ReconcileReport>;
  metadata: IMetadataStore;
  users: IUserStore;
  events: ISecurityEventStore;
  reports: IAuditReportStore;
  checks: Record<string, () => Promise<void>>;
}

interface Ctx {
  requireRole: (req: FastifyRequest, roles: Role[]) => Promise<SessionUser>;
  guard: SecurityGuard;
  audit: SecurityLog;
}

/** Состояние, которое показывает обзор (последняя сверка). */
const state: { lastReconcile: ReconcileReport | null } = { lastReconcile: null };

export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps, ctx: Ctx) {
  const admin = (req: FastifyRequest) => ctx.requireRole(req, ['admin']);
  const staff = (req: FastifyRequest) => ctx.requireRole(req, ['admin', 'auditor']);
  const log = (req: FastifyRequest, user: SessionUser, type: string, details: Record<string, unknown> = {}) =>
    ctx.audit.record({ type, ip: req.ip, userId: user.id, status: 200, details });

  async function health() {
    const result: Record<string, 'ok' | 'down'> = {};
    await Promise.all(
      Object.entries(deps.checks).map(async ([name, check]) => {
        result[name] = await check().then(
          () => 'ok' as const,
          () => 'down' as const,
        );
      }),
    );
    return result;
  }

  // ---------- Обзор ----------

  app.get('/api/admin/overview', async (req) => {
    await admin(req);
    const [stats, users, quotas, blocks, backups, components] = await Promise.all([
      deps.metadata.stats(new Date()),
      deps.users.count(),
      deps.settings.quotas(),
      ctx.guard.listBlocks(),
      deps.backups.list().catch(() => []),
      health(),
    ]);
    return {
      stats: { ...stats, users },
      quotas,
      blocks: blocks.length,
      lastBackup: backups[0] ?? null,
      lastReconcile: state.lastReconcile,
      health: components,
    };
  });

  // ---------- FR-10: квоты ----------

  app.put('/api/admin/quotas', async (req) => {
    const user = await admin(req);
    const quotas = await deps.settings.setQuotas(req.body);
    log(req, user, 'admin.quotas', { reason: `заметка ≤ ${quotas.maxNoteBytes} Б, пользователь ≤ ${quotas.userQuotaBytes} Б` });
    return { quotas };
  });

  // ---------- FR-12: ручная блокировка ----------

  app.get('/api/admin/blocks', async (req) => {
    await admin(req);
    const blocks = await ctx.guard.listBlocks();
    return { blocks: blocks.map((b) => ({ ip: b.ip, until: b.until.toISOString(), reason: b.reason, createdAt: b.createdAt.toISOString() })) };
  });

  app.post<{ Body: { ip?: unknown; hours?: unknown; reason?: unknown } }>('/api/admin/blocks', async (req, reply) => {
    const user = await admin(req);
    const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
    const hours = typeof req.body?.hours === 'number' ? req.body.hours : 24;
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim().slice(0, 200) : 'вручную';
    if (!isIP(ip)) throw new ApiError(400, 'BAD_IP', 'Неверный IP-адрес.');
    if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 365) throw new ApiError(400, 'BAD_HOURS', 'Срок блокировки: от 1 часа до года.');
    if (ip === req.ip) throw new ApiError(400, 'SELF_BLOCK', 'Нельзя заблокировать свой же адрес.');
    await ctx.guard.block(ip, hours, `${reason} (администратор)`);
    log(req, user, 'admin.block', { reason: `${ip} на ${hours} ч` });
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { ip: string } }>('/api/admin/blocks/:ip', async (req, reply) => {
    const user = await admin(req);
    const ip = decodeURIComponent(req.params.ip);
    if (!isIP(ip)) throw new ApiError(400, 'BAD_IP', 'Неверный IP-адрес.');
    await ctx.guard.unblock(ip);
    log(req, user, 'admin.unblock', { reason: ip });
    return reply.code(204).send();
  });

  // ---------- Сверка блобов ----------

  app.post('/api/admin/reconcile', async (req) => {
    const user = await admin(req);
    const report = await deps.reconcile();
    state.lastReconcile = report;
    log(req, user, 'admin.reconcile', { reason: `сирот ${report.orphanBlobs.length}, потеряно ${report.missingBlobs.length}` });
    return report;
  });

  // ---------- FR-11: резервные копии ----------

  app.get('/api/admin/backups', async (req) => {
    await admin(req);
    return { backups: await deps.backups.list() };
  });

  app.post('/api/admin/backups', async (req, reply) => {
    const user = await admin(req);
    const manifest = await deps.backups.create();
    log(req, user, manifest.status === 'ok' ? 'backup.created' : 'backup.failed', { reason: manifest.id });
    return reply.code(201).send(manifest);
  });

  app.post<{ Params: { id: string } }>('/api/admin/backups/:id/restore', async (req) => {
    const user = await admin(req);
    const id = req.params.id;
    if (!/^[\w-]{10,80}$/.test(id)) throw new ApiError(400, 'BAD_BACKUP', 'Неверный идентификатор копии.');
    try {
      const report = await deps.backups.restore(id);
      deps.settings.invalidate(); // квоты в памяти — из восстановленной БД
      log(req, user, 'backup.restored', { reason: id });
      return report;
    } catch (err) {
      throw new ApiError(409, 'RESTORE_FAILED', err instanceof Error ? err.message : 'Восстановление не удалось.');
    }
  });

  // ---------- Роли (FR-01) ----------

  app.put<{ Body: { login?: unknown; role?: unknown } }>('/api/admin/users/role', async (req) => {
    const user = await admin(req);
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const role = req.body?.role;
    if (!(ROLES as readonly unknown[]).includes(role)) throw new ApiError(400, 'BAD_ROLE', `Роль: ${ROLES.join(', ')}.`);
    if (login === user.login && role !== 'admin') {
      throw new ApiError(400, 'SELF_DEMOTE', 'Нельзя снять роль администратора с самого себя.');
    }
    if (!(await deps.users.setRole(login, role as Role))) throw new ApiError(404, 'NO_USER', 'Нет такого пользователя.');
    log(req, user, 'admin.role', { login, role: role as string });
    return { login, role };
  });

  // ---------- FR-13: журнал с поиском (админ и аудитор) ----------

  app.get<{ Querystring: { type?: string; ip?: string; limit?: string } }>('/api/admin/events', async (req) => {
    await staff(req);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
    const type = req.query.type?.slice(0, 40) || undefined;
    const ip = req.query.ip?.slice(0, 45) || undefined;
    const events = await deps.events.search({ limit, ...(type ? { type } : {}), ...(ip ? { ip } : {}) });
    return { events: events.map((e) => ({ ...e, at: e.at.toISOString() })) };
  });

  // ---------- FR-14: отчёты аудита Zero-Knowledge ----------

  app.post('/api/audit/reports', async (req, reply) => {
    const user = await staff(req);
    const report = parseReport(req.body, user.id, new Date());
    await deps.reports.insert(report);
    // FR-14: нарушение — инцидент безопасности, администратор видит его в журнале
    const failed = report.checks.filter((c) => !c.passed).map((c) => c.id);
    ctx.audit.record({
      type: report.passed ? 'audit.passed' : 'audit.failed',
      ip: req.ip,
      userId: user.id,
      status: 201,
      details: report.passed ? {} : { reason: `не пройдены: ${failed.join(', ')}` },
    });
    return reply.code(201).send({ id: report.id, passed: report.passed });
  });

  app.get('/api/audit/reports', async (req) => {
    await staff(req);
    const reports = await deps.reports.list(30);
    return { reports: reports.map((r) => ({ ...r, at: r.at.toISOString() })) };
  });
}
