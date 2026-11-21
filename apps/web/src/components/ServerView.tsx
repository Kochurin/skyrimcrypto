import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { encryptNote, isSupported, MIN_ITERATIONS, MIN_PASSWORD_LENGTH, type EncryptedPackage } from '@cn/crypto';
import { formatBytes, serializeDocument } from '../document.js';
import { Scramble } from './Scramble.js';

/** Больше этого предпросмотр не пересчитывает на каждую букву — слишком тяжело. */
const MAX_PREVIEW_BYTES = 200 * 1024;
/** Сколько символов шифротекста показываем. */
const SHOW_CHARS = 420;

/**
 * «Что видит сервер»: пока вы печатаете, рядом показывается пакет, который получил бы сервер.
 * Шифрование настоящее (тот же криптомодуль), но для живого предпросмотра — 100 000 итераций
 * вместо 600 000, а если пароль ещё не введён — со случайным одноразовым паролем.
 * Ничего никуда не отправляется: пакет живёт только в этом компоненте.
 */
export function ServerView({ title, text, password }: { title: string; text: string; password: string }) {
  const ephemeral = useMemo(
    () => (isSupported() ? crypto.getRandomValues(new Uint32Array(4)).join('-') : 'unsupported-browser'),
    [],
  );
  const [pkg, setPkg] = useState<EncryptedPackage | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const empty = title === '' && text === '';
  const usingRealPassword = [...password].length >= MIN_PASSWORD_LENGTH;

  useEffect(() => {
    if (empty || !isSupported()) {
      setPkg(null);
      return;
    }
    const doc = serializeDocument({ title, text });
    if (doc.length > MAX_PREVIEW_BYTES) {
      setTooBig(true);
      return;
    }
    setTooBig(false);
    let cancelled = false;
    const t = setTimeout(() => {
      encryptNote(doc, usingRealPassword ? password : ephemeral, { iterations: MIN_ITERATIONS })
        .then((p) => !cancelled && setPkg(p))
        .catch(() => !cancelled && setPkg(null));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [title, text, password, usingRealPassword, ephemeral, empty]);

  const cipherBytes = pkg ? Math.floor((pkg.ciphertext.length * 3) / 4) : 0;

  return (
    <aside className="server-view" aria-label="Что получит сервер">
      <div className="server-head">
        <span className="server-dot" aria-hidden="true" />
        <b>Что видит сервер</b>
        <span className="muted small">{pkg ? `${formatBytes(cipherBytes)} шума` : ''}</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {empty ? (
          <motion.p key="empty" className="server-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Начните печатать — здесь появится то, что уйдёт на сервер. Ни одного слова из заметки здесь не будет
          </motion.p>
        ) : tooBig ? (
          <motion.p key="big" className="server-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            Текст большой — живой предпросмотр выключен, чтобы не тормозить. При сохранении он будет зашифрован так же
          </motion.p>
        ) : (
          <motion.pre key="pkg" className="server-json" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {'{\n  "v": 1,\n  "kdf": { "alg": "PBKDF2-SHA256", "iterations": '}
            <span className="hl">{pkg?.kdf.iterations.toLocaleString('ru-RU') ?? '…'}</span>
            {', "salt": "'}
            <Scramble text={pkg?.kdf.salt ?? '…'} duration={300} />
            {'" },\n  "cipher": { "alg": "AES-256-GCM", "iv": "'}
            <Scramble text={pkg?.cipher.iv ?? '…'} duration={300} />
            {'" },\n  "ciphertext": "'}
            <Scramble
              className="hl"
              text={pkg ? pkg.ciphertext.slice(0, SHOW_CHARS) + (pkg.ciphertext.length > SHOW_CHARS ? '…' : '') : '…'}
              duration={450}
            />
            {'"\n}'}
          </motion.pre>
        )}
      </AnimatePresence>
      <p className="server-note">
        {usingRealPassword
          ? 'Зашифровано вашим паролем. Соль и IV новые при каждом изменении — поэтому шифр «пляшет» от каждой буквы'
          : 'Пароль ещё не введён — для предпросмотра взят случайный. Сервер всё равно увидел бы только шум'}
        . Предпросмотр — 100 000 итераций, при сохранении — 600 000
      </p>
    </aside>
  );
}
