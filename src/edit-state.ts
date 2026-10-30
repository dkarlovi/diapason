import { EDIT_FIELDS } from "./Recording/EditFields";
import type { Recording } from "./Recording/Recording.type";
import type { EditSnapshot } from "./Recording/RecordingEdit.type";

export function captureEditSnapshot(record: Recording): EditSnapshot {
  const intent = Object.fromEntries(
    EDIT_FIELDS.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]),
  );
  return structuredClone({ schemaVersion: 1, intent }) as EditSnapshot;
}
export function applyEditSnapshot(record: Recording, snapshot: EditSnapshot): Recording {
  const next = { ...record };
  for (const key of EDIT_FIELDS) delete next[key];
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
