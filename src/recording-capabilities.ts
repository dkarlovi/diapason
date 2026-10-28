import type { Recording } from "./db";
import { DETECTION_KNOBS } from "./note-source";
import { KNOB_DEFS, resolveKnobs, type Knobs } from "./melody/knobs";
import type { MelodySetting } from "./melody/settings";

export function recordingCapabilities(record: Recording) {
  return {
    audio: !record.noteSource,
    analysis: !record.noteSource,
    fixedNotes: !!record.noteSource,
    musicalPitch: true,
    musicalTiming: true,
    noteEdits: true,
  };
}
export function knobAvailability(
  record: Recording,
  key: keyof Knobs,
): { enabled: boolean; reason?: string } {
  return !recordingCapabilities(record)[KNOB_DEFS.find((def) => def.key === key)!.requires]
    ? { enabled: false, reason: "Requires pitch analysis. This tune contains fixed notes." }
    : { enabled: true };
}
export function constrainMelodyChange(record: Recording, next: MelodySetting): MelodySetting {
  if (!record.noteSource) return next;
  const effective = resolveKnobs(next.preset, next.overrides);
  const overrides = { ...next.overrides };
  for (const key of DETECTION_KNOBS) {
    const frozen = record.noteSource.frozenDetection[key];
    if (effective[key] !== frozen) overrides[key] = frozen;
  }
  return { ...next, overrides };
}
