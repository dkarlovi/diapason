import { expect, it } from "vitest";
import { noteRecording } from "../tests/support/note-recording";
import { createPortableTune } from "./portable-tune";
import { createAdHocDraft, isAdHocDirty, validateAdHocDraft, adHocRecording } from "./ad-hoc-tune";
import { reduceEditHistory } from "./edit-history";

const tune = createPortableTune(noteRecording(), []);
const make = () => createAdHocDraft(tune, "#tune=example", "temporary", 1);
it("starts clean and reconstructs the URL baseline", () => {
  const draft = make();
  expect(isAdHocDirty(tune, draft)).toBe(false);
  expect(adHocRecording(tune, draft).noteSource).toEqual(tune.noteSource);
  expect(validateAdHocDraft(JSON.parse(JSON.stringify(draft)), tune, draft.fragment)).toEqual(
    draft,
  );
});
it("counts name, versions and active gestures as changes but undo to baseline is clean", () => {
  const draft = make();
  expect(isAdHocDirty(tune, { ...draft, name: "Changed" })).toBe(true);
  let history = reduceEditHistory(draft.history, { type: "begin", label: "Instrument" });
  history = reduceEditHistory(history, {
    type: "update",
    snapshot: {
      schemaVersion: 1,
      intent: { ...history.commits[0]!.snapshot.intent, play: { instrument: "epiano", octave: 0 } },
    },
  });
  expect(isAdHocDirty(tune, { ...draft, history })).toBe(true);
  history = reduceEditHistory(history, { type: "commit", id: "changed", createdAt: 2 });
  history = reduceEditHistory(history, { type: "undo" });
  expect(isAdHocDirty(tune, { ...draft, history })).toBe(false);
  expect(
    isAdHocDirty(tune, {
      ...draft,
      versions: [
        {
          id: "v",
          recordingId: draft.id,
          name: "One",
          nameKey: "one",
          createdAt: 1,
          commit: history.commits[0]!,
        },
      ],
    }),
  ).toBe(true);
});
it("rejects foreign, malformed and corrupted drafts", () => {
  const draft = make();
  for (const invalid of [
    null,
    { ...draft, fragment: "other" },
    { ...draft, history: { ...draft.history, cursor: 9 } },
    { ...draft, history: { ...draft.history, commits: [] } },
    { ...draft, schemaVersion: 9 },
    { ...draft, versions: [{ recordingId: "other" }] },
  ]) {
    expect(() => validateAdHocDraft(invalid, tune, draft.fragment)).toThrow();
  }
  draft.history.commits[0]!.snapshot.intent.play = { instrument: "epiano", octave: 0 };
  expect(() => validateAdHocDraft(draft, tune, draft.fragment)).toThrow();
});
