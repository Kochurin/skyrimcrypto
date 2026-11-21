import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Scramble } from '../components/Scramble.js';
import { trackSpotlight } from '../components/Interactive.js';
import { SPRING } from '../motion/prefs.js';
import { ApiFailure, deleteNote, listNotes, type NoteSummary, type Usage } from '../api.js';
import { formatBytes } from '../document.js';
import { errorMessage } from '../messages.js';
import { navigate, noteUrl } from '../route.js';
import { useSession } from '../session.js';
import { Alert } from '../components/Alert.js';

type Load = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; notes: NoteSummary[]; usage: Usage | null };

const DAY_MS = 24 * 3600 * 1000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysLeft(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
  if (days <= 1) return 'удалится в течение суток';
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней';
  return `удалится через ${days} ${word}`;
}

/**
 * FR-06 «Список заметок пользователя» и FR-09 «Удаление».
 * Сервер отдаёт только метаданные: названия зашифрованы вместе с текстом,
 * поэтому в списке их нет — так сервер не узнаёт даже темы заметок.
 */
export function NotesPage() {
  const { account, loading } = useSession();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const reload = useCallback(() => {
    setLoad({ kind: 'loading' });
    listNotes().then(
      ({ notes, usage }) => setLoad({ kind: 'ready', notes, usage }),
      (err: unknown) => setLoad({ kind: 'failed', message: errorMessage(err) }),
    );
  }, []);

  useEffect(() => {
    if (account) reload();
  }, [account, reload]);

  if (loading) return <p className="muted center">Загрузка…</p>;

  if (!account) {
    return (
      <section className="card narrow">
        <h1>Мои заметки</h1>
        <p className="muted">Чтобы видеть список своих заметок и удалять их, войдите в учётную запись.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => navigate('/login')}>
            Войти
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="hero compact">
        <h1>
          <Scramble text="Мои заметки" fromCipher duration={700} />
        </h1>
        <p>Названия и текст зашифрованы — чтобы прочитать заметку, откройте её и введите её пароль.</p>
      </section>

      {load.kind === 'ready' && load.usage && <UsageBar usage={load.usage} />}
      {load.kind === 'loading' && <p className="muted center">Загрузка списка…</p>}
      {load.kind === 'failed' && (
        <section className="card narrow">
          <Alert kind="error">{load.message}</Alert>
          <div className="actions">
            <button type="button" className="primary" onClick={reload}>
              Повторить
            </button>
          </div>
        </section>
      )}
      {load.kind === 'ready' && load.notes.length === 0 && (
        <section className="card narrow empty">
          <h2>Заметок пока нет</h2>
          <p className="muted">Заметки, созданные после входа, появятся здесь.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => navigate('/')}>
              Создать заметку
            </button>
          </div>
        </section>
      )}
      {load.kind === 'ready' && load.notes.length > 0 && (
        <ul className="note-list" aria-label="Список заметок">
          <AnimatePresence>
            {load.notes.map((note, i) => (
              <NoteRow
                key={note.id}
                index={i}
                note={note}
                onDeleted={() =>
                  setLoad((l) => (l.kind === 'ready' ? { ...l, notes: l.notes.filter((n) => n.id !== note.id) } : l))
                }
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </>
  );
}

function NoteRow({ note, index, onDeleted }: { note: NoteSummary; index: number; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setWorking(true);
    setError(null);
    try {
      await deleteNote(note.id);
      onDeleted();
    } catch (err) {
      // 404: уже удалена (например, истёк срок) — убираем из списка
      if (err instanceof ApiFailure && err.serverCode === 'NOT_FOUND') onDeleted();
      else setError(errorMessage(err));
      setWorking(false);
      setConfirming(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(noteUrl(note.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обмена недоступен — ссылку можно открыть кнопкой «Открыть»
    }
  }

  return (
    <motion.li
      className="note-row spot"
      onPointerMove={trackSpotlight}
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 8) * 0.06, ...SPRING } }}
      exit={{ opacity: 0, x: 60, scale: 0.96, transition: { duration: 0.22 } }}
      whileHover={{ y: -3 }}
    >
      <div className="note-meta">
        <span className="note-name">Заметка от {formatDate(note.createdAt)}</span>
        <span className="muted small">
          <span className="mono">{note.id.slice(0, 8)}</span> · {formatBytes(note.sizeBytes)} · {daysLeft(note.expiresAt)}
        </span>
        {error && <Alert kind="error">{error}</Alert>}
      </div>
      <div className="actions">
        {confirming ? (
          <>
            <button type="button" className="danger" onClick={remove} disabled={working}>
              {working ? 'Удаление…' : 'Удалить навсегда'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={working}>
              Отмена
            </button>
          </>
        ) : (
          <>
            <button type="button" className="primary small" onClick={() => navigate(`/n/${note.id}`)}>
              Открыть
            </button>
            <button type="button" className="small" onClick={copy}>
              {copied ? 'Скопировано' : 'Ссылка'}
            </button>
            <button type="button" className="small ghost-danger" onClick={() => setConfirming(true)} aria-label={`Удалить заметку ${note.id.slice(0, 8)}`}>
              Удалить
            </button>
          </>
        )}
      </div>
    </motion.li>
  );
}

/** FR-10: сколько места занято из квоты, которую задал администратор. */
function UsageBar({ usage }: { usage: Usage }) {
  const share = usage.quotaBytes > 0 ? Math.min(1, usage.usedBytes / usage.quotaBytes) : 0;
  const level = share > 0.9 ? 'danger' : share > 0.7 ? 'warn' : 'ok';
  return (
    <div className="usage" aria-label="Занятое место">
      <div className="usage-head">
        <span>
          Занято <b>{formatBytes(usage.usedBytes)}</b> из {formatBytes(usage.quotaBytes)}
        </span>
        <span className="muted small">одна заметка — до {formatBytes(usage.maxNoteBytes)}</span>
      </div>
      <div className="usage-track">
        <motion.span
          className={`usage-fill ${level}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  );
}
