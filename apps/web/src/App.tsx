import { EditorPage } from './pages/EditorPage.js';
import { ViewPage } from './pages/ViewPage.js';
import { navigate, useRoute } from './route.js';

/** K1.1 Веб-редактор: два экрана — создание (US-01) и чтение по ссылке (US-02). */
export function App() {
  const route = useRoute();
  return (
    <div className="app">
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
        <span className="chip" title="Шифрование AES-256-GCM в браузере; сервер хранит только шифротекст">
          Zero-Knowledge
        </span>
        {route.page !== 'editor' && (
          <button type="button" className="primary small push" onClick={() => navigate('/')}>
            Новая заметка
          </button>
        )}
      </header>
      <main>
        {route.page === 'editor' && <EditorPage />}
        {route.page === 'view' && <ViewPage key={route.id} id={route.id} />}
        {route.page === 'not-found' && (
          <section className="card">
            <h1>Страница не найдена</h1>
            <button type="button" onClick={() => navigate('/')}>
              Создать заметку
            </button>
          </section>
        )}
      </main>
      <footer className="footer mono">PBKDF2-SHA-256 · AES-256-GCM · Web Crypto API</footer>
    </div>
  );
}
