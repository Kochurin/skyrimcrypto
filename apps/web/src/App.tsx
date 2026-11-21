import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { EASE_OUT } from './motion/prefs.js';
import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotesPage } from './pages/NotesPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { ViewPage } from './pages/ViewPage.js';
import { navigate, useRoute, type Route } from './route.js';
import { SessionProvider, useSession } from './session.js';
import { useState } from 'react';
import { setSoundEnabled, soundEnabled, useTheme } from './motion/theme.js';
import { KeyCursor } from './components/KeyCursor.js';
import { VpnPromo } from './components/VpnPromo.js';

/** K1.1 Веб-редактор: создание (US-01), чтение по ссылке (US-02), учётная запись и список (FR-01, FR-06). */
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </MotionConfig>
  );
}

function Shell() {
  const route = useRoute();
  return (
    <div className="app">
      <Header route={route} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={route.page === 'view' ? `view-${route.id}` : route.page}
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.18 } }}
        >
        {route.page === 'editor' && <EditorPage />}
        {route.page === 'login' && <LoginPage />}
        {route.page === 'notes' && <NotesPage />}
        {route.page === 'admin' && <AdminPage />}
        {route.page === 'audit' && <AuditPage />}
        {route.page === 'view' && <ViewPage key={route.id} id={route.id} />}
        {route.page === 'not-found' && (
          <section className="card narrow">
            <h1>Страница не найдена</h1>
            <div className="actions">
              <button type="button" onClick={() => navigate('/')}>
                Создать заметку
              </button>
            </div>
          </section>
        )}
        </motion.main>
      </AnimatePresence>
      <div className="promo-wrap">
        <VpnPromo />
      </div>
      <Footer />
      <KeyCursor />
    </div>
  );
}

function NavLink({ to, current, children }: { to: string; current: boolean; children: string }) {
  return (
    <a
      href={to}
      className={current ? 'nav-link active' : 'nav-link'}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {current && <motion.span layoutId="nav-pill" className="pill-bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span className="pill-text">{children}</span>
    </a>
  );
}

function Footer() {
  const [sound, setSound] = useState(soundEnabled);
  return (
    <footer className="footer">
      <span className="mono">PBKDF2-SHA-256 · AES-256-GCM · Web Crypto API</span>
      <label className="sound-toggle">
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setSound(e.target.checked);
            setSoundEnabled(e.target.checked);
          }}
        />
        Звук замка
      </label>
    </footer>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg
          key={theme}
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          {dark ? (
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </>
          )}
        </motion.svg>
      </AnimatePresence>
    </button>
  );
}

function Header({ route }: { route: Route }) {
  const { account, loading, logout } = useSession();
  return (
    <header className="topbar">
      <a
        href="/"
        className="brand"
        onClick={(e) => {
          e.preventDefault();
          navigate('/');
        }}
      >
        <span className="logo" aria-hidden="true">SC</span>
        <span className="brand-text">SkyrimCrypto</span>
      </a>
      <span className="chip hide-mobile" title="Шифрование AES-256-GCM в браузере; сервер хранит только шифротекст">
        Zero-Knowledge
      </span>
      <nav className="nav push">
        <NavLink to="/" current={route.page === 'editor'}>
          Новая заметка
        </NavLink>
        {account && (
          <NavLink to="/notes" current={route.page === 'notes'}>
            Мои заметки
          </NavLink>
        )}
        {account && (account.role === 'auditor' || account.role === 'admin') && (
          <NavLink to="/audit" current={route.page === 'audit'}>
            Аудит
          </NavLink>
        )}
        {account?.role === 'admin' && (
          <NavLink to="/admin" current={route.page === 'admin'}>
            Админ
          </NavLink>
        )}
      </nav>
      <ThemeToggle />
      {!loading &&
        (account ? (
          <div className="account">
            <span className="chip hide-mobile" title={`Роль: ${account.role}`}>
              {account.login}
            </span>
            <button
              type="button"
              className="small"
              onClick={() => {
                void logout().finally(() => navigate('/'));
              }}
            >
              Выйти
            </button>
          </div>
        ) : (
          route.page !== 'login' && (
            <button type="button" className="primary small" onClick={() => navigate('/login')}>
              Войти
            </button>
          )
        ))}
    </header>
  );
}
