import type { ReactNode } from 'react';
import { navigate } from '../route.js';
import { useSession } from '../session.js';

/**
 * FR-01: «доступные разделы интерфейса по роли». Это только удобство интерфейса —
 * настоящую проверку роли делает сервер на каждом запросе к /api/admin и /api/audit.
 */
export function RoleGate({ roles, title, children }: { roles: string[]; title: string; children: ReactNode }) {
  const { account, loading } = useSession();
  if (loading) return <p className="muted center">Загрузка…</p>;
  if (!account || !roles.includes(account.role)) {
    return (
      <section className="card narrow">
        <h1>{title}</h1>
        <p className="muted">
          {account ? 'У вашей учётной записи нет доступа к этому разделу.' : 'Войдите в учётную запись с нужной ролью.'}
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => navigate(account ? '/' : '/login')}>
            {account ? 'На главную' : 'Войти'}
          </button>
        </div>
      </section>
    );
  }
  return <>{children}</>;
}
