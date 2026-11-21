import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { decryptNote, isCryptoError, isSupported } from '@cn/crypto';
import { fetchNote } from '../api.js';
import { parseDocument, type NoteDocument } from '../document.js';
import { errorMessage } from '../messages.js';
import { navigate } from '../route.js';
import { Alert } from '../components/Alert.js';
import { PasswordField } from '../components/PasswordField.js';
import { MagneticButton, trackSpotlight } from '../components/Interactive.js';
import { LockIcon } from '../components/LockIcon.js';
import { Scramble } from '../components/Scramble.js';
import { motionAllowed, sleep, SPRING_IN } from '../motion/prefs.js';

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
  const [opened, setOpened] = useState(false);
  const [shake, setShake] = useState(0);
  const supported = isSupported();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password === '') {
      setError('Введите пароль.');
      setShake((n) => n + 1);
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const plaintext = await decryptNote(pkg, password);
      setPassword('');
      // Сначала замок открывается, потом проявляется текст
      setOpened(true);
      if (motionAllowed()) await sleep(450);
      setNote(parseDocument(plaintext));
    } catch (err) {
      setError(errorMessage(err));
      setShake((n) => n + 1);
      if (!isCryptoError(err, 'DECRYPT_FAILED')) setPassword('');
    } finally {
      setWorking(false);
    }
  }

  function hide() {
    setNote(null);
    setOpened(false);
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {note ? (
        <motion.article
          key="note"
          className="card reader spot"
          onPointerMove={trackSpotlight}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
          transition={SPRING_IN}
        >
          <motion.span className="chip ok" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING_IN}>
            Расшифровано в браузере
          </motion.span>
          <h1 className="note-title">
            <Scramble text={note.title || 'Без названия'} fromCipher duration={700} />
          </h1>
          {/* Текст выводится только как текстовый узел: React экранирует всё, HTML не исполняется. */}
          <Scramble as="div" className="note-text" text={note.text} fromCipher duration={1200} delay={150} />
          <div className="actions">
            <button type="button" onClick={hide}>
              Скрыть
            </button>
            <NewNoteButton />
          </div>
        </motion.article>
      ) : (
        <motion.form
          key="unlock"
          className="card narrow unlock spot"
          onSubmit={onSubmit}
          onPointerMove={trackSpotlight}
          noValidate
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={SPRING_IN}
        >
          <LockIcon locked={!opened} shake={shake} size={60} className={opened ? 'open' : ''} />
          <span className="chip">Зашифровано</span>
          <h1>
            <Scramble text="Вам передали заметку" fromCipher duration={900} />
          </h1>
          <p className="muted">Расшифровка происходит в этом браузере. Пароль на сервер не отправляется.</p>
          {!supported ? (
            <Alert kind="warning">Браузер не поддерживает Web Crypto API, расшифровать заметку здесь нельзя.</Alert>
          ) : (
            <>
              <PasswordField label="Пароль" value={password} onChange={setPassword} autoComplete="off" disabled={working} autoFocus />
              <AnimatePresence>
                {error && (
                  <motion.div key={`${error}-${shake}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                    <Alert kind="error">{error}</Alert>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="actions">
                <MagneticButton type="submit" className={working ? 'primary cta busy' : 'primary cta'} disabled={working}>
                  {working ? 'Расшифровка…' : 'Расшифровать'}
                </MagneticButton>
              </div>
            </>
          )}
        </motion.form>
      )}
    </AnimatePresence>
  );
}

function NewNoteButton() {
  return (
    <button type="button" onClick={() => navigate('/')}>
      Создать новую заметку
    </button>
  );
}
