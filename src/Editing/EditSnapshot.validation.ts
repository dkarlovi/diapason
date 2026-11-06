import { EditStorageError } from "./EditStorageError";
import { isNoteEdits } from "./NoteEdits";
import { isMelodySetting } from "../Melody/Settings";
import { INSTRUMENTS } from "../Playback/Instruments";
import type { EditSnapshot } from "../Recording/RecordingEdit.type";
import { hasProperties } from "../Encoding/Properties";
import { EDIT_FIELDS } from "../Recording/EditFields";

const INTENT_FIELDS = new Set<string>(EDIT_FIELDS);

const invalid = () =>
  new EditStorageError("invalid-version", "This version contains unsupported editing data.");
function isPlaybackIntent(value: unknown): boolean {
  if (!hasProperties(value, "instrument", "octave")) return false;
  return (
    INSTRUMENTS.some((instrument) => instrument.id === value.instrument) &&
    typeof value.octave === "number" &&
    [1, 0, -1, -2, -3].includes(value.octave)
  );
}
function isMuteAnchor(value: unknown, duration: number): boolean {
  if (!hasProperties(value, "t", "midi")) return false;
  const { t, midi } = value;
  return (
    typeof t === "number" &&
    typeof midi === "number" &&
    Number.isFinite(t) &&
    t >= 0 &&
    t <= duration &&
    Number.isInteger(midi) &&
    midi >= 0 &&
    midi <= 127
  );
}
function isMutedIntent(value: unknown, duration: number): boolean {
  return Array.isArray(value) && value.every((anchor) => isMuteAnchor(anchor, duration));
}
function isLegacyTuning(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every((knob) => typeof knob === "number" && Number.isFinite(knob))
  );
}
function isLegacyQuantize(value: unknown): boolean {
  if (!hasProperties(value, "on", "subdivision")) return false;
  return (
    typeof value.on === "boolean" &&
    typeof value.subdivision === "number" &&
    Number.isFinite(value.subdivision) &&
    value.subdivision > 0
  );
}
export function validateEditSnapshot(snapshot: EditSnapshot, duration: number): void {
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !snapshot.intent ||
    typeof snapshot.intent !== "object"
  )
    throw invalid();
  const { melody, noteEdits, play, muted, tuning, quantize } = snapshot.intent;
  const valid = [
    Object.keys(snapshot.intent).every((key) => INTENT_FIELDS.has(key)),
    melody === undefined || isMelodySetting(melody),
    noteEdits === undefined || isNoteEdits(noteEdits, duration),
    play === undefined || isPlaybackIntent(play),
    muted === undefined || isMutedIntent(muted, duration),
    tuning === undefined || isLegacyTuning(tuning),
    quantize === undefined || isLegacyQuantize(quantize),
  ];
  if (valid.includes(false)) throw invalid();
}
