import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotesPage } from './pages/NotesPage.js';
import { ViewPage } from './pages/ViewPage.js';
import { navigate, useRoute, type Route } from './route.js';
import { SessionProvider, useSession } from './session.js';

/** K1.1 Веб-редактор: создание (US-01), чтение по ссылке (US-02), учётная запись и список (FR-01, FR-06). */
export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const route = useRoute();
  return (
    <div className="app">
      <Header route={route} />
      <main>
        {route.page === 'editor' && <EditorPage />}
        {route.page === 'login' && <LoginPage />}
        {route.page === 'notes' && <NotesPage />}
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
      </main>
      <footer className="footer mono">PBKDF2-SHA-256 · AES-256-GCM · Web Crypto API</footer>
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
      {children}
    </a>
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
        SkyrimCrypto
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
      </nav>
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
