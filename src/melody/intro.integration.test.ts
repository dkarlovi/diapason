// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../test-support/fixtures";
import { previewNotes } from "../recording";
const intro = loadFixture("whistle-intro");
it("keeps the intro's opening transitions available when reducing correction", () => {
  const record = {
    ...intro.record,
    melody: { preset: "clean" as const, overrides: {}, key: "auto" as const },
  };
  const gentle = previewNotes(record, intro.frames, { preset: "gentle", overrides: {} });
  expect(gentle.filter((note) => note.start < 1.48).length).toBeGreaterThan(1);
  const next = gentle.find((note) => note.start > 1.48);
  expect(next!.start).toBeLessThan(1.6);
  expect(next!.midi).toBeGreaterThan(gentle[0]!.midi);
  expect(record.melody.preset).toBe("clean");
});
