// Tiny hash router: #/ (library), #/new (capture), #/take/:id (editor).

export type Route =
  | { name: 'library' }
  | { name: 'capture' }
  | { name: 'editor'; id: string };

export function parseHash(): Route {
  const hash = location.hash.replace(/^#/, '');
  if (hash === '/new') return { name: 'capture' };
  const m = /^\/take\/(.+)$/.exec(hash);
  if (m) return { name: 'editor', id: decodeURIComponent(m[1]!) };
  return { name: 'library' };
}

export function go(hash: string): void {
  location.hash = hash;
}

export function onRoute(cb: (r: Route) => void): void {
  window.addEventListener('hashchange', () => cb(parseHash()));
  cb(parseHash()); // initial
}
