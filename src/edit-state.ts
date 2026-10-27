import type { Recording } from "./db";
const FIELDS = ["melody", "tuning", "quantize", "noteEdits", "muted", "play"] as const;
export interface EditSnapshot {
  schemaVersion: 1;
  intent: Pick<Recording, (typeof FIELDS)[number]>;
}
export function captureEditSnapshot(record: Recording): EditSnapshot {
  const intent = Object.fromEntries(
    FIELDS.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]),
  );
  return structuredClone({ schemaVersion: 1, intent }) as EditSnapshot;
}
export function applyEditSnapshot(record: Recording, snapshot: EditSnapshot): Recording {
  const next = { ...record };
  for (const key of FIELDS) delete next[key];
  return Object.assign(next, structuredClone(snapshot.intent));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function sameEditSnapshot(a: EditSnapshot, b: EditSnapshot): boolean {
  const comparable = (snapshot: EditSnapshot) => ({
    ...snapshot.intent,
    ...(snapshot.intent.noteEdits
      ? {
          noteEdits: {
            ...snapshot.intent.noteEdits,
            pitch: snapshot.intent.noteEdits.pitch.map(({ ranges, midi }) => ({ ranges, midi })),
          },
        }
      : {}),
  });
  return JSON.stringify(canonical(comparable(a))) === JSON.stringify(canonical(comparable(b)));
}
