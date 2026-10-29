import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { allRecordings, deleteRecording, getRecording, putRecording } from "./db";
import { recording } from "./test-support/recording";
import { insertImportedRecording } from "./recording-import-storage";
afterEach(async () => {
  for (const r of await allRecordings()) await deleteRecording(r.id);
});
it("refuses a collision at save time and preserves local edits", async () => {
  await putRecording(recording({ name: "Local" }));
  await expect(
    insertImportedRecording(recording({ name: "Incoming" }), "original"),
  ).rejects.toThrow(/already|exist|collision/i);
  expect((await getRecording("regression"))?.name).toBe("Local");
  const copy = await insertImportedRecording(recording({ name: "Incoming" }), "copy");
  expect(copy.id).not.toBe("regression");
  expect((await getRecording("regression"))?.name).toBe("Local");
  expect(await allRecordings()).toHaveLength(2);
});
it("only inserts one original when simultaneous imports race", async () => {
  const results = await Promise.allSettled([
    insertImportedRecording(recording(), "original"),
    insertImportedRecording(recording(), "original"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await allRecordings()).toHaveLength(1);
});
