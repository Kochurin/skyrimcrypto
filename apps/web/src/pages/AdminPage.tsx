import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  admin,
  type BackupManifest,
  type IpBlockInfo,
  type Overview,
  type ReconcileReport,
  type SecurityEventInfo,
} from '../api.js';
import { formatBytes } from '../document.js';
import { errorMessage } from '../messages.js';
import { SPRING, SPRING_IN } from '../motion/prefs.js';
import { Alert } from '../components/Alert.js';
import { RoleGate } from '../components/RoleGate.js';
import { Scramble } from '../components/Scramble.js';
import { trackSpotlight } from '../components/Interactive.js';

/**
 * Этап 6 — раздел администратора (US-04): обзор и квоты (FR-10), блокировки (FR-12),
 * журнал (FR-13), резервные копии и сверка (FR-11), роли (FR-01).
 */
const TABS = [
  { id: 'overview', label: 'Обзор и квоты' },
  { id: 'blocks', label: 'Блокировки' },
  { id: 'events', label: 'Журнал' },
  { id: 'backups', label: 'Копии и сверка' },
  { id: 'roles', label: 'Роли' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const MB = 1024 * 1024;

export function AdminPage() {
  return (
    <RoleGate roles={['admin']} title="Администрирование">
      <AdminInner />
    </RoleGate>
  );
}

function AdminInner() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <>
      <section className="hero compact">
        <h1>
          <Scramble text="Администрирование" fromCipher duration={800} />
        </h1>
        <p>Администратор видит только метаданные: ни текстов, ни названий, ни паролей заметок здесь нет</p>
      </section>
      <div className="tabs wide" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {tab === t.id && <motion.span layoutId="admin-tab" className="pill-bg" transition={SPRING} />}
            <span className="pill-text">{t.label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} className="stack-sm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={SPRING_IN}>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'blocks' && <BlocksTab />}
          {tab === 'events' && <EventsTab />}
          {tab === 'backups' && <BackupsTab />}
          {tab === 'roles' && <RolesTab />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card spot" onPointerMove={trackSpotlight}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Общий шаблон «загрузить — показать ошибку». */
function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    load().then(setData, (e: unknown) => setError(errorMessage(e)));
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

// ---------- Обзор и квоты ----------

function OverviewTab() {
  const { data, error, reload } = useLoad(admin.overview);
  const [maxNote, setMaxNote] = useState('');
  const [userQuota, setUserQuota] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setMaxNote(String(data.quotas.maxNoteBytes / MB));
      setUserQuota(String(data.quotas.userQuotaBytes / MB));
    }
  }, [data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await admin.setQuotas({ maxNoteBytes: Math.round(Number(maxNote) * MB), userQuotaBytes: Math.round(Number(userQuota) * MB) });
      setMsg({ kind: 'success', text: 'Квоты сохранены и действуют для новых заметок' });
      reload();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    }
  }

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <p className="muted center">Загрузка…</p>;
  return (
    <>
      <div className="stats">
        <Stat label="Пользователи" value={data.stats.users} />
        <Stat label="Заметки" value={data.stats.notes} hint={`без входа: ${data.stats.anonymous}`} />
        <Stat label="Шифротекст" value={formatBytes(data.stats.bytes)} />
        <Stat label="Блокировки IP" value={data.blocks} />
      </div>
      <Panel title="Состояние (FR-11)">
        <div className="health">
          {Object.entries(data.health).map(([name, state]) => (
            <span key={name} className={`health-item ${state}`}>
              <span className="dot" aria-hidden="true" /> {name === 'db' ? 'PostgreSQL' : name === 's3' ? 'MinIO (S3)' : name}: {state === 'ok' ? 'работает' : 'недоступен'}
            </span>
          ))}
        </div>
        <p className="muted small">
          Последняя копия:{' '}
          {data.lastBackup ? `${new Date(data.lastBackup.createdAt).toLocaleString('ru-RU')} (${data.lastBackup.status === 'ok' ? 'проверена' : 'с ошибками'})` : 'ещё не было'}
        </p>
      </Panel>
      <Panel title="Квоты (FR-10)">
        <form className="row" onSubmit={save}>
          <div className="field">
            <label htmlFor="q-note">Максимум одной заметки, МБ (1–10)</label>
            <input id="q-note" type="number" min={1} max={10} step={0.5} value={maxNote} onChange={(e) => setMaxNote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="q-user">На пользователя, МБ (1–10 240)</label>
            <input id="q-user" type="number" min={1} max={10240} step={1} value={userQuota} onChange={(e) => setUserQuota(e.target.value)} />
          </div>
          <div className="field end">
            <button type="submit" className="primary">
              Сохранить
            </button>
          </div>
        </form>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      </Panel>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string | undefined }) {
  return (
    <motion.div className="stat spot" onPointerMove={trackSpotlight} whileHover={{ y: -3 }}>
      <span className="muted small">{label}</span>
      <b>{value}</b>
      {hint && <span className="muted small">{hint}</span>}
    </motion.div>
  );
}

// ---------- Блокировки ----------

function BlocksTab() {
  const { data, error, reload } = useLoad(admin.blocks);
  const [ip, setIp] = useState('');
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await admin.block(ip.trim(), Number(hours), reason);
      setIp('');
      setReason('');
      reload();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  }

  async function remove(b: IpBlockInfo) {
    try {
      await admin.unblock(b.ip);
      reload();
    } catch (err) {
      setMsg(errorMessage(err));
    }
  }

  return (
    <>
      <Panel title="Заблокировать адрес (FR-12)">
        <form className="row" onSubmit={add}>
          <div className="field">
            <label htmlFor="b-ip">IP-адрес</label>
            <input id="b-ip" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.7" />
          </div>
          <div className="field narrow-field">
            <label htmlFor="b-h">Часов</label>
            <input id="b-h" type="number" min={1} max={8760} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b-r">Причина</label>
            <input id="b-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="перебор ссылок" maxLength={200} />
          </div>
          <div className="field end">
            <button type="submit" className="primary">
              Заблокировать
            </button>
          </div>
        </form>
        {msg && <Alert kind="error">{msg}</Alert>}
      </Panel>
      <Panel title="Действующие блокировки">
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.length === 0 && <p className="muted">Блокировок нет</p>}
        {data && data.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Адрес</th>
                <th>До</th>
                <th>Причина</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {data.map((b) => (
                  <motion.tr key={b.ip} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td className="mono">{b.ip}</td>
                    <td>{new Date(b.until).toLocaleString('ru-RU')}</td>
                    <td>{b.reason}</td>
                    <td>
                      <button type="button" className="small" onClick={() => remove(b)}>
                        Разблокировать
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}

// ---------- Журнал ----------

const EVENT_FILTERS = [
  { value: '', label: 'Все события' },
  { value: 'auth.', label: 'Входы' },
  { value: 'note.', label: 'Заметки' },
  { value: 'rate.', label: 'Превышение лимитов' },
  { value: 'ip.', label: 'Блокировки' },
  { value: 'admin.', label: 'Действия администратора' },
  { value: 'backup.', label: 'Резервные копии' },
  { value: 'audit.', label: 'Аудит' },
  { value: 'server.', label: 'Ошибки сервера' },
];

function EventsTab() {
  const [type, setType] = useState('');
  const [ip, setIp] = useState('');
  const load = useCallback(() => admin.events({ type, ip: ip.trim() }), [type, ip]);
  const { data, error } = useLoad<SecurityEventInfo[]>(load);
  return (
    <Panel title="Журнал безопасности (FR-13)">
      <div className="row">
        <div className="field">
          <label htmlFor="e-type">Тип</label>
          <select id="e-type" value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="e-ip">IP</label>
          <input id="e-ip" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="любой" />
        </div>
      </div>
      <p className="muted small">В журнале нет тел запросов, паролей, токенов и шифротекста — только тип, время, адрес и код ответа</p>
      {error && <Alert kind="error">{error}</Alert>}
      {data && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Событие</th>
                <th>IP</th>
                <th>Код</th>
                <th>Подробности</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e, i) => (
                <tr key={`${e.at}-${i}`} className={/failed|blocked|limited|error|forbidden/.test(e.type) ? 'row-warn' : ''}>
                  <td>{new Date(e.at).toLocaleString('ru-RU')}</td>
                  <td className="mono">{e.type}</td>
                  <td className="mono">{e.ip}</td>
                  <td>{e.status ?? ''}</td>
                  <td className="muted small">
                    {Object.entries(e.details)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 && <p className="muted">Ничего не найдено</p>}
        </div>
      )}
    </Panel>
  );
}

// ---------- Копии и сверка ----------

function BackupsTab() {
  const { data, error, reload } = useLoad<BackupManifest[]>(admin.backups);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [report, setReport] = useState<ReconcileReport | null>(null);

  async function run<T>(label: string, fn: () => Promise<T>, done: (r: T) => string) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ kind: 'success', text: done(r) });
      reload();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Panel title="Резервные копии (FR-11)">
        <p className="muted small">
          Копия — снимок базы и всех блобов с контрольными суммами SHA-256; каждый объект перечитывается и сверяется. Автоматически — раз в сутки (RPO 24 ч)
        </p>
        <div className="actions">
          <button
            type="button"
            className={busy === 'backup' ? 'primary cta busy' : 'primary cta'}
            disabled={!!busy}
            onClick={() => run('backup', admin.backup, (m) => (m.status === 'ok' ? `Копия ${m.id} создана и проверена` : `Копия создана с ошибками: ${m.failed.length} объектов не прошли проверку`))}
          >
            {busy === 'backup' ? 'Копирование…' : 'Сделать копию сейчас'}
          </button>
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Статус</th>
                <th>Заметок</th>
                <th>Размер</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.createdAt).toLocaleString('ru-RU')}</td>
                  <td>
                    <span className={b.status === 'ok' ? 'chip ok' : 'chip bad'}>{b.status === 'ok' ? 'проверена' : 'с ошибками'}</span>
                  </td>
                  <td>{b.notes}</td>
                  <td>{formatBytes(b.bytes)}</td>
                  <td>
                    {b.status === 'ok' &&
                      (confirm === b.id ? (
                        <span className="actions">
                          <button
                            type="button"
                            className="danger small"
                            disabled={!!busy}
                            onClick={() => {
                              setConfirm(null);
                              void run('restore', () => admin.restore(b.id), (r) => `Восстановлено: заметок ${r.notes}, пользователей ${r.users}, блобов ${r.blobs}`);
                            }}
                          >
                            Заменить текущие данные
                          </button>
                          <button type="button" className="small" onClick={() => setConfirm(null)}>
                            Отмена
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="small" disabled={!!busy} onClick={() => setConfirm(b.id)}>
                          Восстановить
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.length === 0 && <p className="muted">Копий ещё нет</p>}
      </Panel>

      <Panel title="Сверка блобов с базой">
        <p className="muted small">
          Ищет файлы в MinIO без строки в базе («сироты» старше часа удаляются) и строки без файла (помечаются удалёнными)
        </p>
        <div className="actions">
          <button
            type="button"
            className={busy === 'reconcile' ? 'cta busy' : 'cta'}
            disabled={!!busy}
            onClick={async () => {
              setBusy('reconcile');
              try {
                setReport(await admin.reconcile());
              } catch (err) {
                setMsg({ kind: 'error', text: errorMessage(err) });
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'reconcile' ? 'Сверка…' : 'Запустить сверку'}
          </button>
        </div>
        {report && (
          <div className="stats">
            <Stat label="Файлов в MinIO" value={report.blobs} />
            <Stat label="Строк в базе" value={report.rows} />
            <Stat label="Сирот удалено" value={report.removedOrphans} hint={report.youngOrphans ? `свежих оставлено: ${report.youngOrphans}` : undefined} />
            <Stat label="Без файла" value={report.missingBlobs.length} />
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------- Роли ----------

function RolesTab() {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState('auditor');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await admin.setRole(login, role);
      setMsg({ kind: 'success', text: `${r.login}: теперь ${ROLE_NAMES[r.role] ?? r.role}` });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    }
  }

  return (
    <Panel title="Роли (FR-01)">
      <p className="muted small">Автор — заметки; аудитор — аудит Zero-Knowledge и журнал; администратор — всё в этом разделе</p>
      <form className="row" onSubmit={save}>
        <div className="field">
          <label htmlFor="r-login">Логин</label>
          <input id="r-login" value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="r-role">Роль</label>
          <select id="r-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="author">Автор</option>
            <option value="auditor">Аудитор</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        <div className="field end">
          <button type="submit" className="primary">
            Назначить
          </button>
        </div>
      </form>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </Panel>
  );
}

const ROLE_NAMES: Record<string, string> = { author: 'автор', auditor: 'аудитор', admin: 'администратор' };

export type { Overview };
