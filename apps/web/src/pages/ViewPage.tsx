import { useEffect, useState, type FormEvent } from 'react';
import { decryptNote, isCryptoError, isSupported } from '@cn/crypto';
import { fetchNote } from '../api.js';
import { parseDocument, type NoteDocument } from '../document.js';
import { errorMessage } from '../messages.js';
import { navigate } from '../route.js';
import { Alert } from '../components/Alert.js';
import { PasswordField } from '../components/PasswordField.js';

type Load =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; pkg: unknown };

/**
 * US-02 «Открыть заметку по ссылке»:
 * GET /api/notes/:id → пароль → расшифровка в браузере (K1.2) → текст.
 * Неверный пароль и подмена данных неотличимы: GCM-тег просто не сходится.
 */
export function ViewPage({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    fetchNote(id).then(
      (pkg) => !cancelled && setLoad(pkg === null ? { kind: 'missing' } : { kind: 'ready', pkg }),
      (err: unknown) => !cancelled && setLoad({ kind: 'failed', message: errorMessage(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  switch (load.kind) {
    case 'loading':
      return (
        <section className="card">
          <p className="muted">Загрузка зашифрованной заметки…</p>
        </section>
      );
    case 'missing':
      return (
        <section className="card">
          <h1>Заметка не найдена</h1>
          <p>Ссылка неверна, заметка удалена или истёк срок её хранения.</p>
          <NewNoteButton />
        </section>
      );
    case 'failed':
      return (
        <section className="card">
          <h1>Не удалось загрузить заметку</h1>
          <Alert kind="error">{load.message}</Alert>
          <div className="actions">
            <button type="button" className="primary" onClick={() => setAttempt((n) => n + 1)}>
              Повторить
            </button>
          </div>
        </section>
      );
    case 'ready':
      return <Unlock pkg={load.pkg} />;
  }
}

function Unlock({ pkg }: { pkg: unknown }) {
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<NoteDocument | null>(null);
  const supported = isSupported();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password === '') {
      setError('Введите пароль.');
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const plaintext = await decryptNote(pkg, password);
      setNote(parseDocument(plaintext));
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
      if (!isCryptoError(err, 'DECRYPT_FAILED')) setPassword('');
    } finally {
      setWorking(false);
    }
  }

  if (note) {
    return (
      <article className="card reader">
        <h1 className="note-title">{note.title || 'Без названия'}</h1>
        {/* Текст выводится только как текстовый узел: React экранирует всё, HTML не исполняется. */}
        <div className="note-text">{note.text}</div>
        <div className="actions">
          <button type="button" onClick={() => setNote(null)}>
            Скрыть
          </button>
          <NewNoteButton />
        </div>
      </article>
    );
  }

  return (
    <form className="card narrow" onSubmit={onSubmit} noValidate>
      <span className="chip">Зашифровано</span>
      <h1>Вам передали заметку</h1>
      <p className="muted">Расшифровка происходит в этом браузере. Пароль на сервер не отправляется.</p>
      {!supported ? (
        <Alert kind="warning">Браузер не поддерживает Web Crypto API, расшифровать заметку здесь нельзя.</Alert>
      ) : (
        <>
          <PasswordField label="Пароль" value={password} onChange={setPassword} autoComplete="off" disabled={working} autoFocus />
          {error && <Alert kind="error">{error}</Alert>}
          <div className="actions">
            <button type="submit" className="primary" disabled={working}>
              {working ? 'Расшифровка…' : 'Расшифровать'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function NewNoteButton() {
  return (
    <button type="button" onClick={() => navigate('/')}>
      Создать новую заметку
    </button>
  );
}
