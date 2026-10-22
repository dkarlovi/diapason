// Path helpers for the app's project subdirectory on GitHub Pages.
export const BASE = "/diapason";
export const takePath = (id: string): string => `/take/${encodeURIComponent(id)}`;

export function go(path: string): void {
  window.history.pushState(null, "", `${BASE}${path}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
