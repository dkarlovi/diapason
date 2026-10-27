import { expect, it } from "vitest";
import { recording } from "./test-support/recording";
import { captureEditSnapshot } from "./edit-state";
import {
  canRedoEdit,
  createEditHistory,
  currentEditCommit,
  displayEditSnapshot,
  reduceEditHistory,
  type EditCommit,
  type EditHistory,
} from "./edit-history";
const snapshot = (octave: number) =>
  captureEditSnapshot(recording({ play: { instrument: "beep", octave } }));
const baseline: EditCommit = {
  id: "a",
  label: "Initial state",
  createdAt: 0,
  snapshot: snapshot(0),
};
function change(h: EditHistory, octave: number, id: string) {
  h = reduceEditHistory(h, { type: "begin", label: "Change octave" });
  h = reduceEditHistory(h, { type: "update", snapshot: snapshot(octave) });
  return reduceEditHistory(h, { type: "commit", id, createdAt: 1 });
}
it("commits gesture endpoints and undoes resets in chronological order", () => {
  let h = reduceEditHistory(createEditHistory(baseline), { type: "begin", label: "Change octave" });
  for (const v of [-1, -2, -3]) h = reduceEditHistory(h, { type: "update", snapshot: snapshot(v) });
  expect(h.commits).toHaveLength(1);
  h = reduceEditHistory(h, { type: "commit", id: "b", createdAt: 1 });
  h = change(h, 0, "reset");
  h = reduceEditHistory(h, { type: "undo" });
  expect(currentEditCommit(h).snapshot.intent.play?.octave).toBe(-3);
  h = reduceEditHistory(h, { type: "undo" });
  expect(currentEditCommit(h).id).toBe("a");
  expect(currentEditCommit(reduceEditHistory(h, { type: "redo" })).id).toBe("b");
});
it("cancels drafts first and preserves redo for cancelled or no-op gestures", () => {
  let h = reduceEditHistory(change(createEditHistory(baseline), -1, "b"), { type: "undo" });
  h = reduceEditHistory(h, { type: "begin", label: "Draft" });
  h = reduceEditHistory(h, { type: "update", snapshot: snapshot(-2) });
  expect(displayEditSnapshot(h).intent.play?.octave).toBe(-2);
  h = reduceEditHistory(h, { type: "undo" });
  expect(h.cursor).toBe(0);
  expect(canRedoEdit(h)).toBe(true);
  h = change(h, 0, "no-op");
  expect(h.commits).toHaveLength(2);
  expect(canRedoEdit(h)).toBe(true);
  h = change(h, -3, "c");
  expect(h.commits.map((c) => c.id)).toEqual(["a", "c"]);
});
it("retains every commit during a long session", () => {
  let h = createEditHistory(baseline);
  for (let i = 1; i <= 1000; i++) h = change(h, i % 2 ? -1 : 0, String(i));
  expect(h.commits).toHaveLength(1001);
  for (let i = 0; i < 1000; i++) h = reduceEditHistory(h, { type: "undo" });
  expect(currentEditCommit(h).id).toBe("a");
});
