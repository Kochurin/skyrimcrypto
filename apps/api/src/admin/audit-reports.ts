import { randomUUID } from 'node:crypto';
import { ApiError } from '../notes.js';

/**
 * FR-14 «Аудит Zero-Knowledge», US-03. Сами проверки выполняет браузер аудитора
 * (только там видно, что уходит в сеть до шифрования); сервер хранит отчёты
 * и при нарушении фиксирует инцидент безопасности в журнале.
 */
export interface AuditCheck {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface AuditReport {
  id: string;
  at: Date;
  userId: string;
  passed: boolean;
  durationMs: number;
  checks: AuditCheck[];
}

export interface IAuditReportStore {
  insert(report: AuditReport): Promise<void>;
  list(limit: number): Promise<AuditReport[]>;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Разобрать отчёт из браузера: только ожидаемые поля и разумные размеры. */
export function parseReport(input: unknown, userId: string, now: Date): AuditReport {
  const body = input as { checks?: unknown; durationMs?: unknown } | null;
  if (!body || !Array.isArray(body.checks) || body.checks.length === 0 || body.checks.length > 50) {
    throw new ApiError(400, 'BAD_REPORT', 'Отчёт аудита: нужен список проверок (1–50).');
  }
  const checks: AuditCheck[] = body.checks.map((c: unknown) => {
    const x = c as Record<string, unknown>;
    if (typeof x.passed !== 'boolean') throw new ApiError(400, 'BAD_REPORT', 'Отчёт аудита: у проверки нет результата.');
    return { id: str(x.id, 40), name: str(x.name, 120), passed: x.passed, detail: str(x.detail, 400) };
  });
  return {
    id: randomUUID(),
    at: now,
    userId,
    passed: checks.every((c) => c.passed),
    durationMs: typeof body.durationMs === 'number' ? Math.max(0, Math.round(body.durationMs)) : 0,
    checks,
  };
}
