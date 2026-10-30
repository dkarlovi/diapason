import { expect, it } from "vitest";
import { recording } from "../../tests/support/recording";
import { applyEditSnapshot, captureEditSnapshot, sameEditSnapshot } from "./EditState";
it("restores absent legacy fields without reverting metadata or copying audio", () => {
  const original = recording({ tuning: { rmsGate: 0.02 }, quantize: { on: true, subdivision: 4 } });
  const snapshot = captureEditSnapshot(original);
  const current = {
    ...original,
    name: "Keep",
    melody: { preset: "clean" as const, key: "auto" as const, overrides: {} },
  };
  const restored = applyEditSnapshot(current, snapshot);
  expect(restored.melody).toBeUndefined();
  expect(restored.tuning).toEqual({ rmsGate: 0.02 });
  expect(restored.quantize).toEqual({ on: true, subdivision: 4 });
  expect(restored.name).toBe("Keep");
  expect(restored.audio).toBe(original.audio);
});
it("isolates snapshots and compares intent including explicit overrides", () => {
  const rec = recording({
    melody: { preset: "clean", key: "auto", overrides: { steadiness: 0.4, keyPull: 0.2 } },
  });
  const saved = captureEditSnapshot(rec);
  rec.melody!.overrides.steadiness = 0.9;
  expect(saved.intent.melody?.overrides.steadiness).toBe(0.4);
  const reordered = captureEditSnapshot(
    recording({
      melody: { preset: "clean", key: "auto", overrides: { keyPull: 0.2, steadiness: 0.4 } },
    }),
  );
  expect(sameEditSnapshot(saved, reordered)).toBe(true);
  delete reordered.intent.melody!.overrides.steadiness;
  expect(sameEditSnapshot(saved, reordered)).toBe(false);
});
it("ignores generated pitch IDs when a draft returns to the same pitch", () => {
  const a = captureEditSnapshot(
    recording({
      noteEdits: { version: 1, pitch: [{ id: "a", midi: 70, ranges: [{ start: 0, end: 1 }] }] },
    }),
  );
  const b = structuredClone(a);
  b.intent.noteEdits!.pitch[0]!.id = "b";
  expect(sameEditSnapshot(a, b)).toBe(true);
});
