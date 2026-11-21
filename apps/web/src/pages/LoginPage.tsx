import { useId, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Scramble } from '../components/Scramble.js';
import { MagneticButton, trackSpotlight } from '../components/Interactive.js';
import { SPRING, SPRING_IN } from '../motion/prefs.js';
import { ApiFailure, signIn, signUp } from '../api.js';
import { errorMessage } from '../messages.js';
import { navigate } from '../route.js';
import { useSession } from '../session.js';
import { Alert } from '../components/Alert.js';
import { PasswordField } from '../components/PasswordField.js';

type Mode = 'login' | 'register';

/**
 * FR-01. Вход и регистрация. Пароль учётной записи отличается от паролей заметок:
 * он открывает список заметок, но не расшифровывает их.
 */
export function LoginPage() {
  const { setAccount } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginId = useId();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (login.trim() === '' || password === '') {
      setError('Введите логин и пароль.');
      return;
    }
    if (mode === 'register' && password !== confirm) {
      setError('Пароли не совпадают.');
      return;
    }
    setWorking(true);
    try {
      const account = mode === 'login' ? await signIn(login, password) : await signUp(login, password);
      setPassword('');
      setConfirm('');
      setAccount(account);
      navigate('/notes');
    } catch (err) {
      setError(err instanceof ApiFailure && err.code === 'REJECTED' ? err.message : errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <motion.form
      className="card narrow spot"
      onSubmit={onSubmit}
      onPointerMove={trackSpotlight}
      noValidate
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_IN}
    >
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => switchMode('login')}>
          {mode === 'login' && <motion.span layoutId="auth-tab" className="pill-bg" transition={SPRING} />}
          <span className="pill-text">Вход</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => switchMode('register')}>
          {mode === 'register' && <motion.span layoutId="auth-tab" className="pill-bg" transition={SPRING} />}
          <span className="pill-text">Регистрация</span>
        </button>
      </div>
      <h1>
        <Scramble text={mode === 'login' ? 'Вход в учётную запись' : 'Новая учётная запись'} fromCipher duration={600} />
      </h1>
      <p className="muted">
        Учётная запись хранит список ваших заметок и позволяет их удалять. Содержимое заметок по-прежнему зашифровано
        их собственными паролями — сервер их не знает.
      </p>

      <div className="field">
        <label htmlFor={loginId}>Логин</label>
        <input
          id={loginId}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={32}
          disabled={working}
          autoFocus
        />
      </div>
      <PasswordField
        label="Пароль учётной записи"
        value={password}
        onChange={setPassword}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        disabled={working}
      />
      <AnimatePresence initial={false}>
        {mode === 'register' && (
          <motion.div
            key="register-extra"
            className="stack-sm"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <PasswordField label="Пароль ещё раз" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={working} />
            <p className="hint">Логин: 3–32 символа (латиница, цифры, «.», «-», «_»). Пароль — от 8 символов. Не используйте пароль заметок.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div key={error} initial={{ opacity: 0 }} animate={{ opacity: 1, x: [8, -6, 4, 0] }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            <Alert kind="error">{error}</Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="actions">
        <MagneticButton type="submit" className={working ? 'primary cta busy' : 'primary cta'} disabled={working}>
          {working ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать учётную запись'}
        </MagneticButton>
      </div>
    </motion.form>
  );
}
