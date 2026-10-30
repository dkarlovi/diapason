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
  it("exposes only the meaningful knobs", () => {
    expect(KNOB_DEFS.map((def) => def.key).sort()).toEqual(
      [
        "levelGate",
        "minNoteMs",
        "silenceGapMs",
        "steadiness",
        "keyPull",
        "contextCorrection",
        "mode",
        "maxMoveSemitones",
        "leapPenalty",
        "grid",
        "gridPull",
        "swing",
        "syncopation",
        "articulation",
      ].sort(),
    );
  });
  it("as played turns every musical prior off", () => {
    expect(PRESETS["as-played"].knobs).toMatchObject({
      keyPull: 0,
      mode: "auto",
      leapPenalty: 0,
      maxMoveSemitones: 0,
      grid: 0,
      swing: 0,
      syncopation: 0,
    });
  });
  it("overrides win over the preset and unknown keys are ignored", () => {
    const knobs = resolveKnobs("clean", { steadiness: 0.1, bogus: 3 } as never);
    expect(knobs.steadiness).toBe(0.1);
    expect(knobs).not.toHaveProperty("bogus");
  });
  it("intent presets add no feel, and Clean and Auto tune snap to an eighth grid", () => {
    for (const preset of Object.values(PRESETS).filter((preset) => preset.kind === "intent"))
      expect(preset.knobs).toMatchObject({
        grid: ["clean", "auto-tune"].includes(preset.id) ? 2 : 0,
        swing: 0,
        syncopation: 0,
      });
  });
  it("isKnobs rejects out-of-range and wrong-typed values", () => {
    for (const value of [
      { keyPull: 2 },
      { grid: "x" },
      { steadiness: NaN },
      { mode: "lydian" },
      { stickiness: 0.5 },
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
