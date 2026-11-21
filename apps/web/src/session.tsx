import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, signOut, type Account } from './api.js';

/**
 * Состояние входа (FR-01). Сам токен лежит в httpOnly-cookie и странице недоступен;
 * здесь только логин и роль, полученные от /api/auth/me.
 */
interface Session {
  account: Account | null;
  /** Пока не известно, выполнен ли вход. */
  loading: boolean;
  setAccount: (account: Account | null) => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((a) => !cancelled && setAccount(a))
      .catch(() => !cancelled && setAccount(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } finally {
      setAccount(null);
    }
  }, []);

  const value = useMemo(() => ({ account, loading, setAccount, logout }), [account, loading, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession вне SessionProvider');
  return s;
}
