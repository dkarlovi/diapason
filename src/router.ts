// Path helpers for the app's project subdirectory on GitHub Pages.
export const BASE = "/diapason";
export const takePath = (id: string): string => `/take/${encodeURIComponent(id)}`;

export function go(path: string): void {
  const route = path.startsWith("#") ? path.slice(1) : path;
  const url = `${BASE}${route.startsWith("/") ? route : `/${route}`}`;
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
