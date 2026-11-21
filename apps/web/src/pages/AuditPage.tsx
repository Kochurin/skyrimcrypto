import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { audit, type AuditCheck, type AuditReportInfo } from '../api.js';
import { runZkAudit, STEPS } from '../audit/zk-audit.js';
import { errorMessage } from '../messages.js';
import { useSession } from '../session.js';
import { SPRING_IN } from '../motion/prefs.js';
import { Alert } from '../components/Alert.js';
import { MagneticButton, trackSpotlight } from '../components/Interactive.js';
import { Scramble } from '../components/Scramble.js';
import { RoleGate } from '../components/RoleGate.js';

type StepState = 'pending' | 'running' | AuditCheck;

/**
 * FR-14, US-03: раздел аудитора. Аудит выполняется в этом браузере — именно здесь видно,
 * что уходит в сеть, — а отчёт сохраняется на сервере. Нарушение = инцидент в журнале.
 */
export function AuditPage() {
  return (
    <RoleGate roles={['auditor', 'admin']} title="Аудит Zero-Knowledge">
      <AuditInner />
    </RoleGate>
  );
}

function AuditInner() {
  const { account } = useSession();
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ passed: boolean; durationMs: number; saved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditReportInfo[]>([]);

  const loadHistory = useCallback(() => {
    audit.list().then(setHistory, () => setHistory([]));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  async function start() {
    setRunning(true);
    setError(null);
    setResult(null);
    setStates(Object.fromEntries(STEPS.map((s) => [s.id, 'pending' as const])));
    try {
      const { checks, durationMs } = await runZkAudit({
        onStep: (id, state) => setStates((prev) => ({ ...prev, [id]: state })),
      });
      const passed = checks.every((c) => c.passed);
      let saved = false;
      try {
        await audit.save(checks, durationMs);
        saved = true;
      } catch (err) {
        setError(`Отчёт не сохранён: ${errorMessage(err)}`);
      }
      setResult({ passed, durationMs, saved });
      loadHistory();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <section className="hero compact">
        <h1>
          <Scramble text="Аудит Zero-Knowledge" fromCipher duration={800} />
        </h1>
        <p>
          Браузер создаёт контрольную заметку, перехватывает всё, что уходит на сервер, и ищет там пароль и текст. Плюс
          проверки криптомодуля и подмены данных
        </p>
      </section>

      <motion.section className="card spot audit" onPointerMove={trackSpotlight} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_IN}>
        <div className="actions between">
          <span className="muted small">Аудитор: {account?.login}</span>
          <MagneticButton type="button" className={running ? 'primary cta busy' : 'primary cta'} onClick={start} disabled={running}>
            {running ? 'Идёт аудит…' : result ? 'Запустить ещё раз' : 'Запустить аудит'}
          </MagneticButton>
        </div>

        <ol className="checklist">
          {STEPS.map((s, i) => {
            const st = states[s.id] ?? 'pending';
            const done = typeof st === 'object';
            const cls = done ? (st.passed ? 'ok' : 'bad') : st;
            return (
              <motion.li
                key={s.id}
                className={`check ${cls}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <span className="check-icon" aria-hidden="true">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={cls} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }}>
                      {cls === 'ok' ? '✓' : cls === 'bad' ? '✕' : cls === 'running' ? <span className="spinner" /> : i + 1}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="check-body">
                  <span>{s.name}</span>
                  {done && <span className="muted small">{st.detail}</span>}
                </span>
              </motion.li>
            );
          })}
        </ol>

        <AnimatePresence>
          {result && (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Alert kind={result.passed ? 'success' : 'error'}>
                {result.passed
                  ? `Все проверки пройдены за ${(result.durationMs / 1000).toFixed(1)} с. Пароль и текст не покидают браузер`
                  : 'Обнаружено нарушение. Инцидент записан в журнал безопасности — администратор его увидит'}
                {result.saved ? '. Отчёт сохранён' : ''}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <Alert kind="error">{error}</Alert>}
      </motion.section>

      <section className="card">
        <h2>История отчётов</h2>
        {history.length === 0 ? (
          <p className="muted">Отчётов пока нет</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Итог</th>
                <th>Проверок</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString('ru-RU')}</td>
                  <td>
                    <span className={r.passed ? 'chip ok' : 'chip bad'}>{r.passed ? 'пройден' : 'нарушение'}</span>
                  </td>
                  <td>
                    {r.checks.filter((c) => c.passed).length} / {r.checks.length}
                  </td>
                  <td>{(r.durationMs / 1000).toFixed(1)} с</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
