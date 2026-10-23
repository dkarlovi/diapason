import { describe, expect, it } from "vitest";
import { KNOB_DEFS, PRESETS, resolveKnobs, isKnobs } from "./knobs";

describe("melody knobs", () => {
  it("defines every knob exactly once with a family and a valid default in range", () => {
    expect(new Set(KNOB_DEFS.map((def) => def.key)).size).toBe(
      Object.keys(PRESETS.gentle.knobs).length,
    );
    for (const preset of Object.values(PRESETS))
      for (const def of KNOB_DEFS) {
        expect(["listening", "key", "shape", "rhythm"]).toContain(def.family);
        const value = preset.knobs[def.key];
        if (def.kind === "range") {
          expect(value).toBeGreaterThanOrEqual(def.min);
          expect(value).toBeLessThanOrEqual(def.max);
        } else expect(def.options.map((option) => option.value)).toContain(value);
      }
  });
  it("as played turns every musical prior off", () => {
    expect(PRESETS["as-played"].knobs).toMatchObject({
      pitchTrust: 1,
      keyPull: 0,
      harmonyPull: 0,
      leapPenalty: 0,
      maxMoveSemitones: 0,
      grid: 0,
      swing: 0,
      syncopation: 0,
    });
  });
  it("overrides win over the preset and unknown keys are ignored", () => {
    const knobs = resolveKnobs("clean", { stickiness: 0.1, bogus: 3 } as never);
    expect(knobs.stickiness).toBe(0.1);
    expect(knobs).not.toHaveProperty("bogus");
  });
  it("intent presets add no feel, and only Clean snaps to a grid", () => {
    for (const preset of Object.values(PRESETS).filter((preset) => preset.kind === "intent"))
      expect(preset.knobs).toMatchObject({
        grid: preset.id === "clean" ? 2 : 0,
        swing: 0,
        syncopation: 0,
      });
  });
  it("isKnobs rejects out-of-range and wrong-typed values", () => {
    for (const value of [
      { keyPull: 2 },
      { grid: "x" },
      { pitchTrust: NaN },
      null,
      [],
      { bogus: 1 },
      { grid: 1.5 },
    ])
      expect(isKnobs(value)).toBe(false);
    expect(isKnobs({ keyPull: 0.3 })).toBe(true);
    expect(isKnobs({})).toBe(true);
  });
});
