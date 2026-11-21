import { useEffect, useState } from 'react';

export type Route =
  | { page: 'editor' }
  | { page: 'login' }
  | { page: 'notes' }
  | { page: 'admin' }
  | { page: 'audit' }
  | { page: 'view'; id: string }
  | { page: 'not-found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { page: 'editor' };
  if (pathname === '/login') return { page: 'login' };
  if (pathname === '/notes') return { page: 'notes' };
  if (pathname === '/admin') return { page: 'admin' };
  if (pathname === '/audit') return { page: 'audit' };
  const m = /^\/n\/([^/]+)\/?$/.exec(pathname);
  if (m?.[1] && UUID.test(m[1])) return { page: 'view', id: m[1].toLowerCase() };
  return { page: 'not-found' };
}

export function noteUrl(id: string): string {
  return `${window.location.origin}/n/${id}`;
}

export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}
