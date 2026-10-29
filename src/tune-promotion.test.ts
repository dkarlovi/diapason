import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import { promoteAdHocTune } from "./tune-promotion";
import { createAdHocDraft } from "./ad-hoc-tune";
import { createPortableTune } from "./portable-tune";
import { noteRecording } from "./test-support/note-recording";
import { getRecording } from "./db";
import { listVersions } from "./edit-storage";
import { reduceEditHistory } from "./edit-history";
it("saves the baseline, name, current history and versions atomically", async () => {
  const tune = createPortableTune(noteRecording(), []);
  const draft = createAdHocDraft(tune, "#tune=x", "temporary", 1);
  draft.name = "Saved work";
  let history = reduceEditHistory(draft.history, { type: "begin", label: "Sound" });
  history = reduceEditHistory(history, {
    type: "update",
    snapshot: {
      schemaVersion: 1,
      intent: { ...history.commits[0]!.snapshot.intent, play: { instrument: "beep", octave: 0 } },
    },
  });
  draft.history = reduceEditHistory(history, { type: "commit", id: "changed", createdAt: 2 });
  draft.versions = [
    {
      id: "temporary-version",
      recordingId: draft.id,
      name: "One",
      nameKey: "one",
      createdAt: 2,
      commit: draft.history.commits[1]!,
    },
  ];
  await promoteAdHocTune(tune, draft, "saved-tune", 3);
  const saved = (await getRecording("saved-tune"))!;
  expect(saved.name).toBe("Saved work");
  expect(saved.editHistory).toEqual(draft.history);
  expect(saved.play).toEqual({ instrument: "beep", octave: 0 });
  expect((await listVersions(saved.id))[0]).toMatchObject({ recordingId: saved.id, name: "One" });
  await expect(promoteAdHocTune(tune, draft, saved.id, 4)).rejects.toThrow();
  expect(await listVersions(saved.id)).toHaveLength(1);
});

it("rolls back the recording if saving a named version fails", async () => {
  const tune = createPortableTune(noteRecording(), []);
  const draft = createAdHocDraft(tune, "#tune=rollback", "temporary-rollback", 1);
  draft.versions = [
    {
      id: "v",
      recordingId: draft.id,
      name: "One",
      nameKey: "one",
      createdAt: 1,
      commit: draft.history.commits[0]!,
    },
  ];
  const original = IDBObjectStore.prototype.add;
  const add = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (this.name === "versions") throw new DOMException("Storage is full", "QuotaExceededError");
    return original.call(this, value, key);
  });
  try {
    await expect(promoteAdHocTune(tune, draft, "rolled-back", 2)).rejects.toThrow();
    expect(await getRecording("rolled-back")).toBeUndefined();
    expect(await listVersions("rolled-back")).toEqual([]);
  } finally {
    add.mockRestore();
  }
});
