// Path helpers for the app's project subdirectory on GitHub Pages.
export const BASE = "/diapason/";
export const recordingPath = (id: string): string => `/recording/${encodeURIComponent(id)}`;
