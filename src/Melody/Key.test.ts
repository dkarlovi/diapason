import { expect, it } from "vitest";
import reference from "../../tests/fixtures/whistle-regression/reference.json";
import { isOutOfKey, keyName, parallelKey, rankKeys, scalePitchClasses } from "./Key";
const note = (midi: number, duration = 1) => ({ midi, name: "", start: 0, duration });
it("ranks E minor first for the take-1 reference melody", () => {
  expect(keyName(rankKeys(reference.map((n) => ({ ...n, name: "" })))[0]!.key)).toBe("E minor");
});
it("weights pitch classes by duration", () => {
  const ranks = rankKeys([note(60, 3), note(64, 2), note(67, 2), note(66, 0.05)]);
  expect(ranks.findIndex((r) => keyName(r.key) === "C major")).toBeLessThan(
    ranks.findIndex((r) => keyName(r.key) === "G major"),
  );
});
it("returns no keys for no notes and does not throw for one pitch class", () => {
  expect(rankKeys([])).toEqual([]);
  const ranks = rankKeys([note(76, 0.3)]);
  expect(ranks).toHaveLength(24);
  expect(ranks.every((r) => Number.isFinite(r.score))).toBe(true);
});
it("minor scales include the leading tone", () => {
  expect(scalePitchClasses({ tonic: 4, mode: "minor" })).toEqual(
    new Set([4, 6, 7, 9, 11, 0, 2, 3]),
  );
  expect(scalePitchClasses({ tonic: 0, mode: "major" })).toEqual(new Set([0, 2, 4, 5, 7, 9, 11]));
  expect(parallelKey({ tonic: 4, mode: "minor" }, "major")).toEqual({ tonic: 4, mode: "major" });
});
it("ranks a uniform histogram deterministically without NaN", () => {
  const ranks = rankKeys(Array.from({ length: 12 }, (_, midi) => note(60 + midi)));
  expect(ranks.every((r) => r.score === 0)).toBe(true);
  expect(ranks.slice(0, 3).map((r) => keyName(r.key))).toEqual(["C major", "C minor", "C# major"]);
});

it("classifies octave-independent pitches against major, minor, and unknown keys", () => {
  const major = scalePitchClasses({ tonic: 0, mode: "major" });
  expect([60, 61, 71, 72, -1, -11].map((midi) => isOutOfKey(midi, major))).toEqual([
    false,
    true,
    false,
    false,
    false,
    true,
  ]);
  const minor = scalePitchClasses({ tonic: 9, mode: "minor" });
  expect([67, 68, 70].map((midi) => isOutOfKey(midi, minor))).toEqual([false, false, true]);
  expect(isOutOfKey(61, null)).toBe(false);
  expect(isOutOfKey(61, undefined)).toBe(false);
});
