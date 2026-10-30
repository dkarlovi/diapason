import type { Recording, MutedNote, QuantizeSetting } from "./Recording/Recording.type";
import { EditStorageError } from "./edit-storage-error";
import { isNoteEdits } from "./note-edits";
import { isMelodySetting } from "./melody/settings";
import { INSTRUMENTS } from "./instruments";
import type { EditSnapshot } from "./Recording/RecordingEdit.type";

const invalid = () =>
  new EditStorageError("invalid-version", "This version contains unsupported editing data.");
function isPlaybackIntent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const play = value as NonNullable<Recording["play"]>;
  return (
    INSTRUMENTS.some((instrument) => instrument.id === play.instrument) &&
    [1, 0, -1, -2, -3].includes(play.octave)
  );
}
function isMuteAnchor(value: unknown, duration: number): boolean {
  if (!value || typeof value !== "object") return false;
  const { t, midi } = value as MutedNote;
  return (
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
  if (!value || typeof value !== "object") return false;
  const setting = value as QuantizeSetting;
  return (
    typeof setting.on === "boolean" &&
    Number.isFinite(setting.subdivision) &&
    setting.subdivision > 0
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
  const fields = ["melody", "noteEdits", "play", "muted", "tuning", "quantize"];
  const valid = [
    Object.keys(snapshot.intent).every((key) => fields.includes(key)),
    melody === undefined || isMelodySetting(melody),
    noteEdits === undefined || isNoteEdits(noteEdits, duration),
    play === undefined || isPlaybackIntent(play),
    muted === undefined || isMutedIntent(muted, duration),
    tuning === undefined || isLegacyTuning(tuning),
    quantize === undefined || isLegacyQuantize(quantize),
  ];
  if (valid.includes(false)) throw invalid();
}
