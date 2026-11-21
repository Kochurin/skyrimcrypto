import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import { encryptNote, isSupported, MAX_PLAINTEXT_BYTES, validateNewPassword } from '@cn/crypto';
import { createNote, TTL_OPTIONS, type TtlDays } from '../api.js';
import { formatBytes, serializeDocument, utf8Length } from '../document.js';
import { errorMessage } from '../messages.js';
import { navigate, noteUrl } from '../route.js';
import { useSession } from '../session.js';
import { EASE_OUT, motionAllowed, sleep, SPRING } from '../motion/prefs.js';
import { Alert } from '../components/Alert.js';
import { CipherField } from '../components/CipherField.js';
import { GlyphBurst } from '../components/GlyphBurst.js';
import { MagneticButton, trackSpotlight } from '../components/Interactive.js';
import { LockIcon } from '../components/LockIcon.js';
import { PasswordField } from '../components/PasswordField.js';
import { Scramble } from '../components/Scramble.js';
import { StrengthMeter } from '../components/StrengthMeter.js';
import { ServerView } from '../components/ServerView.js';
import { HowItWorks } from '../components/HowItWorks.js';
import { playLockClick } from '../motion/theme.js';

type Status =
  | { kind: 'editing' }
  | { kind: 'working'; step: string }
  | { kind: 'saved'; url: string; expiresAt: string; owned: boolean; from: Rect | null };

interface Rect {
  x: number;
  y: number;
  size: number;
}

/** Сколько символов показываем в «церемонии» шифрования. */
const PREVIEW_CHARS = 700;
/** Сколько длится превращение текста в шифротекст, мс. */
const CEREMONY_MS = 1100;

/**
 * US-01 «Создать и зашифровать заметку»:
 * текст → пароль дважды → шифрование в браузере (K1.2) → POST /api/notes → ссылка.
 * Пока идёт отправка, текст на глазах превращается в настоящий шифротекст пакета.
 */
export function EditorPage() {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'editing' });
  const [ttl, setTtl] = useState<TtlDays>(30);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const { account } = useSession();
  const supported = isSupported();
  const formControls = useAnimationControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [showServer, setShowServer] = useState(true);

  // Появление формы и «вздрагивание» при ошибке (без перемонтирования: фокус не теряется)
  useEffect(() => {
    void formControls.start({ opacity: 1, y: 0, transition: { delay: 0.25, duration: 0.7, ease: EASE_OUT } });
  }, [formControls]);
  useEffect(() => {
    if (errorKey > 0) void formControls.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.4 } });
  }, [errorKey, formControls]);

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

  function fail(message: string) {
    setError(message);
    setErrorKey((k) => k + 1); // форма «вздрагивает» при каждой ошибке
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (text.trim() === '' && title.trim() === '') return fail('Заметка пустая.');
    try {
      validateNewPassword(password);
    } catch (err) {
      return fail(errorMessage(err));
    }
    if (password !== confirm) return fail('Пароли не совпадают.');

    const animate = motionAllowed();
    const visible = (text || title).slice(0, PREVIEW_CHARS);
    try {
      setStatus({ kind: 'working', step: 'Шифрование…' });
      if (animate) {
        setPreview(visible);
        // Церемония должна быть видна: поле текста — в центр экрана
        sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const pkg = await encryptNote(serializeDocument({ title, text }), password);
      // Показываем начало НАСТОЯЩЕГО шифротекста той же длины, что видимый текст
      if (animate) setPreview(pkg.ciphertext.slice(0, Math.max(visible.length, 24)));
      setStatus({ kind: 'working', step: 'Отправка шифротекста…' });
      const [created] = await Promise.all([createNote(pkg, ttl), sleep(animate ? CEREMONY_MS : 0)]);
      // Пароль больше не нужен — убираем его из состояния страницы.
      setPassword('');
      setConfirm('');
      setPreview(null);
      // Откуда «вылетит» замок: позиция замка на кнопке (после прокрутки наверх)
      window.scrollTo({ top: 0, behavior: 'auto' });
      const lock = ctaRef.current?.querySelector('.cta-lock')?.getBoundingClientRect();
      const from = animate && lock ? { x: lock.left + lock.width / 2, y: lock.top + lock.height / 2, size: lock.width } : null;
      setStatus({ kind: 'saved', url: noteUrl(created.id), expiresAt: created.expiresAt, owned: created.owned, from });
    } catch (err) {
      // Текст и пароль остаются в форме: можно повторить попытку.
      setPreview(null);
      setStatus({ kind: 'editing' });
      fail(errorMessage(err));
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      {status.kind === 'saved' ? (
        <SavedView key="saved" url={status.url} expiresAt={status.expiresAt} owned={status.owned} from={status.from} onNew={startNew} />
      ) : (
        <motion.div key="editor" className="stack" exit={{ opacity: 0, y: -16, scale: 0.98, transition: { duration: 0.25 } }}>
          <section className="hero">
            <CipherField />
            <h1>
              <Scramble text="Заметка, которую прочитает только " fromCipher duration={1100} />
              <Scramble text="адресат." className="marker" fromCipher duration={1100} delay={250} />
            </h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease: EASE_OUT }}>
              Текст шифруется прямо в браузере. Сервер хранит шифротекст и не знает ни пароля, ни содержимого.
            </motion.p>
          </section>

          <motion.form
            className={working ? 'card composer spot working' : 'card composer spot'}
            onSubmit={onSubmit}
            onPointerMove={trackSpotlight}
            noValidate
            initial={{ opacity: 0, y: 28 }}
            animate={formControls}
          >
            {!supported && (
              <Alert kind="warning">
                Браузер не поддерживает Web Crypto API, поэтому шифрование недоступно. Писать можно, но сохранить заметку не
                получится: открытый текст на сервер не отправляется.
              </Alert>
            )}

            <div className="field">
              <label htmlFor="note-title" className="sr-only">
                Название
              </label>
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

            <div className={showServer ? 'split on' : 'split'}>
            <div className="field grow sheet" ref={sheetRef}>
              <label htmlFor="note-text" className="sr-only">
                Текст
              </label>
              <textarea
                id="note-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Пароль от Wi-Fi в офисе, доступы к хостингу, личные записи…"
                disabled={working}
              />
              <AnimatePresence>
                {preview !== null && (
                  <motion.div
                    className="cipher-overlay"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Scramble text={preview} duration={CEREMONY_MS} />
                    <motion.div className="scanline" initial={{ y: '-10%' }} animate={{ y: '110%' }} transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }} />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="sheet-foot">
                <span className={tooLarge ? 'hint hint-error' : 'hint'}>
                  {formatBytes(bytes)} из {formatBytes(MAX_PLAINTEXT_BYTES)}
                </span>
                <label className="switch">
                  <input type="checkbox" checked={showServer} onChange={(e) => setShowServer(e.target.checked)} />
                  <span className="switch-track" aria-hidden="true">
                    <motion.span className="switch-thumb" layout transition={SPRING} />
                  </span>
                  Что видит сервер
                </label>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {showServer && (
                <motion.div
                  key="server"
                  className="split-side"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                  transition={SPRING}
                >
                  <ServerView title={title} text={text} password={password} />
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            <div className="row">
              <div className="field">
                <PasswordField label="Пароль" value={password} onChange={setPassword} autoComplete="new-password" disabled={working} />
                <StrengthMeter password={password} />
              </div>
              <div className="field">
                <PasswordField label="Пароль ещё раз" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={working} />
                <MatchHint password={password} confirm={confirm} />
              </div>
            </div>
            <p className="hint">Пароль нигде не хранится — ни на сервере, ни в браузере. Забытый пароль восстановить нельзя.</p>

            <AnimatePresence>
              {error && (
                <motion.div key={error} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                  <Alert kind="error">{error}</Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="actions between">
              <fieldset className="segmented" disabled={working}>
                <legend>Хранить</legend>
                {TTL_OPTIONS.map((days) => (
                  <label key={days} className={ttl === days ? 'checked' : ''}>
                    <input type="radio" name="ttl" value={days} checked={ttl === days} onChange={() => setTtl(days)} />
                    {ttl === days && <motion.span layoutId="ttl-pill" className="pill-bg" transition={SPRING} />}
                    <span className="pill-text">{days === 1 ? '1 день' : `${days} дней`}</span>
                  </label>
                ))}
              </fieldset>
              <MagneticButton ref={ctaRef} type="submit" className={working ? 'primary cta busy' : 'primary cta'} disabled={!supported || working || tooLarge}>
                <LockIcon locked={working} size={18} className="cta-lock" />
                {status.kind === 'working' ? status.step : 'Зашифровать и сохранить'}
              </MagneticButton>
            </div>
            <p className="hint">
              {account
                ? `Вы вошли как ${account.login}: заметка появится в «Моих заметках», её можно будет удалить.`
                : 'Без входа заметку нельзя удалить вручную — она удалится сама по истечении срока.'}
            </p>
          </motion.form>

          <ol className="steps">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.n}
                className="spot"
                onPointerMove={trackSpotlight}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.08, ...SPRING }}
              >
                <span className="mono">{s.n}</span>
                <b>{s.title}</b>
                {s.text}
              </motion.li>
            ))}
          </ol>

          <HowItWorks />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const STEPS = [
  { n: '01', title: 'Пишете заметку', text: 'Текст и название остаются на этом устройстве.' },
  { n: '02', title: 'Шифруете паролем', text: 'AES-256-GCM, ключ из пароля через PBKDF2 (600 000 итераций).' },
  { n: '03', title: 'Отправляете ссылку', text: 'Ссылку и пароль — разными каналами. Хранится от 1 до 30 дней.' },
];

function MatchHint({ password, confirm }: { password: string; confirm: string }) {
  const state = confirm === '' ? 'empty' : confirm === password ? 'ok' : 'bad';
  return (
    <div className="strength" aria-live="polite">
      <AnimatePresence mode="wait">
        {state !== 'empty' && (
          <motion.span
            key={state}
            className={state === 'ok' ? 'match ok' : 'match bad'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {state === 'ok' ? '✓ Пароли совпадают' : 'Пароли пока не совпадают'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function SavedView({
  url,
  expiresAt,
  owned,
  from,
  onNew,
}: {
  url: string;
  expiresAt: string;
  owned: boolean;
  from: Rect | null;
  onNew: () => void;
}) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ x: number; y: number; scale: number } | null>(null);

  // Общий элемент: замок «перелетает» с кнопки «Зашифровать» в карточку (FLIP)
  useLayoutEffect(() => {
    const to = badgeRef.current?.getBoundingClientRect();
    if (!from || !to) return;
    setFlight({ x: from.x - (to.left + to.width / 2), y: from.y - (to.top + to.height / 2), scale: from.size / to.width });
  }, [from]);
  const [copied, setCopied] = useState(false);
  const [locked, setLocked] = useState(!motionAllowed());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // замок защёлкивается, когда долетел
    const t = setTimeout(() => {
      setLocked(true);
      playLockClick();
    }, from ? 600 : 250);
    return () => clearTimeout(t);
  }, [from]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
    }
  }

  return (
    <motion.section
      className="card narrow saved"
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...SPRING, opacity: { duration: 0.25 } }}
    >
      <motion.div
        ref={badgeRef}
        className="saved-badge"
        initial={false}
        animate={flight ? { x: [flight.x, 0], y: [flight.y, 0], scale: [flight.scale, 1] } : {}}
        transition={{ duration: 0.65, ease: EASE_OUT }}
      >
        <LockIcon locked={locked} size={64} />
        {locked && <GlyphBurst />}
      </motion.div>
      <motion.span className="chip ok" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35, ...SPRING }}>
        Сохранено
      </motion.span>
      <h1>
        <Scramble text="Заметка зашифрована" fromCipher duration={800} delay={150} />
      </h1>
      <Alert kind="success">
        Передайте ссылку и пароль получателю <strong>разными каналами</strong>: по одной ссылке заметку не прочитать.
      </Alert>
      <div className="field">
        <label htmlFor="note-link">Ссылка на заметку</label>
        <div className="inline">
          <input id="note-link" ref={inputRef} value={url} readOnly onFocus={(e) => e.target.select()} />
          <MagneticButton type="button" className="primary" onClick={copy}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? 'y' : 'n'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                {copied ? 'Скопировано' : 'Копировать'}
              </motion.span>
            </AnimatePresence>
          </MagneticButton>
        </div>
      </div>
      <p className="hint">
        Хранится до {new Date(expiresAt).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}.
      </p>
      <div className="actions">
        <button type="button" onClick={onNew}>
          Новая заметка
        </button>
        {owned && (
          <button type="button" onClick={() => navigate('/notes')}>
            Мои заметки
          </button>
        )}
      </div>
    </motion.section>
  );
}
