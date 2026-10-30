import { expect, it } from "vitest";
import { recording } from "../../tests/support/recording";
import { DEFAULT_PRESET } from "./knobs";
import { melodySettingFor, newRecordingMelody } from "./settings";
it("legacy tuning and grid carry over to the default preset", () => {
  expect(
    melodySettingFor(
      recording({
        tuning: {
          rmsGate: 0.01,
          clarityThreshold: 0.95,
          minDurationSec: 0.12,
          silenceGapSec: 0.15,
          hysteresisSemitones: 0.8,
        },
        quantize: { on: true, subdivision: 4 },
      }),
    ),
  ).toEqual({
    preset: DEFAULT_PRESET,
    key: "auto",
    overrides: {
      levelGate: 0.01,
      minNoteMs: 120,
      silenceGapMs: 150,
      grid: 4,
      gridPull: 1,
    },
  });
});
it("a saved melody setting is used as is", () => {
  const melody = { preset: "clean" as const, key: "auto" as const, overrides: { steadiness: 0.2 } };
  expect(melodySettingFor(recording({ melody }))).toEqual(melody);
});
it("saved overrides for knobs that no longer exist are dropped", () => {
  const melody = {
    preset: "clean" as const,
    key: "auto" as const,
    overrides: { stickiness: 0.2, clarityGate: 0.95, keyPull: 0.5 } as never,
  };
  expect(melodySettingFor(recording({ melody })).overrides).toEqual({ keyPull: 0.5 });
});
it("new captures start on the default preset with the measured level gate", () => {
  expect(newRecordingMelody(0.012)).toEqual({
    preset: DEFAULT_PRESET,
    key: "auto",
    overrides: { levelGate: 0.012 },
  });
});
it("legacy recordings without a grid keep performed timing", () => {
  expect(melodySettingFor(recording()).overrides).not.toHaveProperty("grid");
  expect(
    melodySettingFor(recording({ quantize: { on: false, subdivision: 4 } })).overrides.grid,
  ).toBe(0);
});
