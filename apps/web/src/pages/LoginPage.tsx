import { useId, useState, type FormEvent } from 'react';
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
    <form className="card narrow" onSubmit={onSubmit} noValidate>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => switchMode('login')}>
          Вход
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => switchMode('register')}>
          Регистрация
        </button>
      </div>
      <h1>{mode === 'login' ? 'Вход в учётную запись' : 'Новая учётная запись'}</h1>
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
      {mode === 'register' && (
        <PasswordField label="Пароль ещё раз" value={confirm} onChange={setConfirm} autoComplete="new-password" disabled={working} />
      )}
      {mode === 'register' && (
        <p className="hint">Логин: 3–32 символа (латиница, цифры, «.», «-», «_»). Пароль — от 8 символов. Не используйте пароль заметок.</p>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      <div className="actions">
        <button type="submit" className="primary" disabled={working}>
          {working ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать учётную запись'}
        </button>
      </div>
    </form>
  );
}
