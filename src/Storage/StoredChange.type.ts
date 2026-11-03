/** Announces a successful write so every open instance can show the stored state. */
export type StoredChange =
  | { kind: "recording"; id: string }
  | { kind: "tune-draft"; fragment: string; draft: unknown; savedAt: number; source: string };
