import { useEffect, useRef, useState, type FormEvent } from 'react';
import { encryptNote, isSupported, MAX_PLAINTEXT_BYTES, validateNewPassword } from '@cn/crypto';
import { createNote } from '../api.js';
import { formatBytes, serializeDocument, utf8Length } from '../document.js';
import { errorMessage } from '../messages.js';
import { noteUrl } from '../route.js';
import { Alert } from '../components/Alert.js';
import { PasswordField } from '../components/PasswordField.js';

type Status =
  | { kind: 'editing' }
  | { kind: 'working'; step: string }
  | { kind: 'saved'; url: string; expiresAt: string };

/**
 * US-01 «Создать и зашифровать заметку»:
 * текст → пароль дважды → шифрование в браузере (K1.2) → POST /api/notes → ссылка.
 */
export function EditorPage() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'editing' });
  const [error, setError] = useState<string | null>(null);
  const supported = isSupported();

  // Лимит проверяется по тому, что реально шифруется (с обёрткой документа),
  // а пользователю показывается размер его собственного текста.
  const tooLarge = utf8Length(serializeDocument({ title, text })) > MAX_PLAINTEXT_BYTES;
  const bytes = utf8Length(title) + utf8Length(text);
  const working = status.kind === 'working';
  const dirty = status.kind !== 'saved' && (title !== '' || text !== '');

  // Несохранённый текст не должен теряться при случайном закрытии вкладки.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (text.trim() === '' && title.trim() === '') {
      setError('Заметка пустая.');
      return;
    }
    try {
      validateNewPassword(password);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают.');
      return;
    }
    try {
      setStatus({ kind: 'working', step: 'Шифрование в браузере…' });
      const pkg = await encryptNote(serializeDocument({ title, text }), password);
      setStatus({ kind: 'working', step: 'Отправка шифротекста…' });
      const created = await createNote(pkg);
      // Пароль больше не нужен — убираем его из состояния страницы.
      setPassword('');
      setConfirm('');
      setStatus({ kind: 'saved', url: noteUrl(created.id), expiresAt: created.expiresAt });
    } catch (err) {
      // Текст и пароль остаются в форме: можно повторить попытку.
      setStatus({ kind: 'editing' });
      setError(errorMessage(err));
    }
  }

  function startNew() {
    setTitle('');
    setText('');
    setPassword('');
    setConfirm('');
    setError(null);
    setStatus({ kind: 'editing' });
  }

  if (status.kind === 'saved') {
    return <SavedView url={status.url} expiresAt={status.expiresAt} onNew={startNew} />;
  }

  return (
    <>
    <section className="hero">
      <h1>Заметка, которую прочитает только адресат.</h1>
      <p>Текст шифруется прямо в браузере. Сервер хранит шифротекст и не знает ни пароля, ни содержимого.</p>
    </section>
    <form className="card composer" onSubmit={onSubmit} noValidate>
      {!supported && (
        <Alert kind="warning">
          Браузер не поддерживает Web Crypto API, поэтому шифрование недоступно. Писать можно, но сохранить заметку не
          получится: открытый текст на сервер не отправляется.
        </Alert>
      )}

      <div className="field">
        <label htmlFor="note-title" className="sr-only">Название</label>
        <input
          id="note-title"
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          maxLength={200}
          disabled={working}
        />
      </div>

      <div className="field grow">
        <label htmlFor="note-text" className="sr-only">Текст</label>
        <textarea
          id="note-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Пароль от Wi-Fi в офисе, доступы к хостингу, личные записи…"
          disabled={working}
        />
        <div className={tooLarge ? 'hint hint-error' : 'hint'}>
          {formatBytes(bytes)} из {formatBytes(MAX_PLAINTEXT_BYTES)}
        </div>
      </div>

      <div className="row">
        <PasswordField label="Пароль" value={password} onChange={setPassword} autoComplete="new-password" disabled={working} />
        <PasswordField label="Пароль ещё раз" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={working} />
      </div>
      <p className="hint">Пароль нигде не хранится — ни на сервере, ни в браузере. Забытый пароль восстановить нельзя.</p>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="actions end">
        <button type="submit" className="primary" disabled={!supported || working || tooLarge}>
          {status.kind === 'working' ? status.step : 'Зашифровать и сохранить'}
        </button>
      </div>
    </form>
    <ol className="steps">
      <li><span className="mono">01</span><b>Пишете заметку</b>Текст и название остаются на этом устройстве.</li>
      <li><span className="mono">02</span><b>Шифруете паролем</b>AES-256-GCM, ключ из пароля через PBKDF2 (600 000 итераций).</li>
      <li><span className="mono">03</span><b>Отправляете ссылку</b>Ссылку и пароль — разными каналами. Хранится 30 дней.</li>
    </ol>
    </>
  );
}

function SavedView({ url, expiresAt, onNew }: { url: string; expiresAt: string; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select();
    }
  }

  return (
    <section className="card narrow">
      <span className="chip ok">Сохранено</span>
      <h1>Заметка зашифрована</h1>
      <Alert kind="success">
        Передайте ссылку и пароль получателю <strong>разными каналами</strong>: по одной ссылке заметку не прочитать.
      </Alert>
      <div className="field">
        <label htmlFor="note-link">Ссылка на заметку</label>
        <div className="inline">
          <input id="note-link" ref={inputRef} value={url} readOnly onFocus={(e) => e.target.select()} />
          <button type="button" className="primary" onClick={copy}>
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      </div>
      <p className="hint">
        Хранится до {new Date(expiresAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}.
      </p>
      <div className="actions">
        <button type="button" onClick={onNew}>
          Новая заметка
        </button>
      </div>
    </section>
  );
}
