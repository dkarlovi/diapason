import { expect, it } from "vitest";
import { noteRecording } from "../../tests/support/note-recording";
import { recording } from "../../tests/support/recording";
import {
  constrainMelodyChange,
  knobAvailability,
  recordingCapabilities,
} from "./RecordingCapabilities";
import { melodySettingFor } from "../Melody/Settings";
import { resolveKnobs } from "../Melody/Knobs";
it("disables only controls requiring missing information", () => {
  const tune = noteRecording();
  expect(recordingCapabilities(tune).audio).toBe(false);
  expect(knobAvailability(tune, "steadiness").enabled).toBe(false);
  expect(knobAvailability(tune, "steadiness").reason).toMatch(/analysis/i);
  expect(knobAvailability(tune, "keyPull").enabled).toBe(true);
  expect(recordingCapabilities(recording()).audio).toBe(true);
});
it("guards preset and reset paths while preserving supported musical changes", () => {
  const tune = noteRecording();
  const melody = constrainMelodyChange(tune, { preset: "sad", overrides: {}, key: "auto" });
  const effective = resolveKnobs(melody.preset, melody.overrides);
  expect(effective.mode).toBe("minor");
  expect(effective.steadiness).toBe(tune.noteSource.frozenDetection.steadiness);
  expect(constrainMelodyChange(tune, melodySettingFor(tune))).toEqual(melodySettingFor(tune));
});
