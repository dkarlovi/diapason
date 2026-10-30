import "fake-indexeddb/auto";
import { beforeAll, expect, it } from "vitest";
import {
  deleteRecording,
  getRecording,
  putRecording,
  saveWaveform,
} from "./Recording/Recording.storage";
import { recording } from "../tests/support/recording";
import { captureEditSnapshot } from "./edit-state";
import type { EditCommit } from "./edit-history";
import { openDatabase } from "./db-connection";
import {
  deleteVersion,
  listVersions,
  renameVersion,
  saveEditCommit,
  saveRecordingName,
  saveVersion,
  validateEditSnapshot,
  type SavedVersion,
} from "./edit-storage";
const commit = (id: string, octave = 0): EditCommit => ({
  id,
  createdAt: 1,
  label: "Octave",
  snapshot: captureEditSnapshot(recording({ play: { instrument: "beep", octave } })),
});
const version = (recordingId: string, name: string, c: EditCommit): SavedVersion => ({
  id: crypto.randomUUID(),
  recordingId,
  name,
  nameKey: name.toLowerCase(),
  createdAt: 1,
  commit: c,
});
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("diapason", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("recordings", { keyPath: "id" });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("recordings", "readwrite");
      tx.objectStore("recordings").put(recording({ id: "legacy", tuning: { rmsGate: 0.02 } }));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    request.onerror = () => reject(request.error);
  });
});
it("upgrades a v1 database without losing legacy recordings", async () => {
  expect((await openDatabase()).version).toBe(3);
  expect((await getRecording("legacy"))?.tuning).toEqual({ rmsGate: 0.02 });
  expect(await listVersions("legacy")).toEqual([]);
});
it("merges edit state without reverting name or waveform", async () => {
  await putRecording(recording({ id: "merge" }));
  await saveRecordingName("merge", "Keep");
  await saveWaveform("merge", { version: 1, rms: new Float32Array([0.2]) });
  await saveEditCommit("merge", commit("a", -1), null);
  const r = (await getRecording("merge"))!;
  expect(r.name).toBe("Keep");
  expect(r.waveform?.rms[0]).toBeCloseTo(0.2);
  expect(r.play?.octave).toBe(-1);
});
it("allows only one save of an expected head and detects A B A revisits", async () => {
  await putRecording(recording({ id: "cas" }));
  const results = await Promise.allSettled([
    saveEditCommit("cas", commit("a"), null),
    saveEditCommit("cas", commit("b"), null),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  const head1 = (await getRecording("cas"))!.editHead!;
  const head2 = await saveEditCommit("cas", commit("b"), head1);
  const head3 = await saveEditCommit("cas", commit("a"), head2);
  expect(head3).toEqual({ commitId: "a", revision: 3 });
  await expect(saveEditCommit("cas", commit("c"), head1)).rejects.toMatchObject({
    code: "conflict",
  });
});
it("retains self contained versions with unique names and immutable targets", async () => {
  await putRecording(recording({ id: "versions" }));
  const c = commit("v", -2);
  const head = await saveEditCommit("versions", c, null);
  const v = version("versions", " First ", c);
  await saveVersion(v, head);
  await expect(saveVersion(version("versions", "first", c), head)).rejects.toMatchObject({
    code: "duplicate-name",
  });
  await expect(saveVersion(version("versions", "  ", c), head)).rejects.toMatchObject({
    code: "invalid-version",
  });
  await renameVersion("versions", v.id, "Second");
  const saved = (await listVersions("versions"))[0]!;
  expect(saved.name).toBe("Second");
  expect(saved.commit.snapshot.intent.play?.octave).toBe(-2);
  await deleteVersion("versions", v.id);
  expect(await listVersions("versions")).toEqual([]);
});
it("rejects corrupt snapshots and never resurrects a deleted recording", async () => {
  await putRecording(recording({ id: "delete" }));
  const c = commit("d");
  const head = await saveEditCommit("delete", c, null);
  await saveVersion(version("delete", "Saved", c), head);
  await expect(
    saveVersion(
      version("delete", "Broken", { ...c, snapshot: { ...c.snapshot, schemaVersion: 2 } as never }),
      head,
    ),
  ).rejects.toMatchObject({ code: "invalid-version" });
  await deleteRecording("delete");
  expect(await listVersions("delete")).toEqual([]);
  await expect(saveEditCommit("delete", c, head)).rejects.toMatchObject({ code: "missing" });
  await expect(saveRecordingName("delete", "No")).rejects.toMatchObject({ code: "missing" });
});
it("reports abort rather than treating a successful request as a save", async () => {
  const db = await openDatabase();
  const tx = db.transaction("recordings", "readwrite");
  const request = tx.objectStore("recordings").put(recording({ id: "aborted" }));
  await new Promise<void>((resolve) => {
    request.onsuccess = () => {
      tx.abort();
    };
    tx.onabort = () => resolve();
  });
  expect(await getRecording("aborted")).toBeUndefined();
});

it("round trips legacy settings and boundary mute anchors in saved intent", async () => {
  const rec = recording({
    id: "validation-fields",
    muted: [
      { t: 0, midi: 0 },
      { t: 1, midi: 127 },
    ],
    play: { instrument: "flute", octave: -3 },
    tuning: { rmsGate: 0.01 },
    quantize: { on: false, subdivision: 4 },
  });
  await putRecording(rec);
  await saveEditCommit(
    rec.id,
    { ...commit("valid-fields"), snapshot: captureEditSnapshot(rec) },
    null,
  );
  const saved = (await getRecording(rec.id))!;
  expect(saved.muted).toEqual([
    { t: 0, midi: 0 },
    { t: 1, midi: 127 },
  ]);
  expect(saved.play).toEqual({ instrument: "flute", octave: -3 });
  expect(saved.quantize).toEqual({ on: false, subdivision: 4 });
});
it.each([
  ["muted", null],
  ["muted", [null]],
  ["muted", [{ t: -1, midi: 60 }]],
  ["muted", [{ t: 2, midi: 60 }]],
  ["muted", [{ t: 0.5, midi: 128 }]],
  ["muted", [{ t: 0.5, midi: 1.5 }]],
  ["play", { instrument: "unknown", octave: 0 }],
  ["play", { instrument: "flute", octave: -9 }],
  ["tuning", { rmsGate: NaN }],
  ["quantize", { on: false, subdivision: 0 }],
])("rejects malformed %s fields without interpreting them", (field, value) => {
  const snapshot = captureEditSnapshot(recording());
  Object.assign(snapshot.intent, { [field as string]: value });
  expect(() => validateEditSnapshot(snapshot, 1)).toThrow(/unsupported editing data/);
});
it("persists full history atomically and rejects a mismatched current commit", async () => {
  await putRecording(recording({ id: "history" }));
  const baseline = commit("initial", 0),
    edited = commit("edited", -1);
  const history = { commits: [baseline, edited], cursor: 1, draft: null };
  const head = await saveEditCommit("history", edited, null, history);
  expect((await getRecording("history"))?.editHistory).toEqual(history);
  await expect(saveEditCommit("history", baseline, head, history)).rejects.toThrow();
  expect((await getRecording("history"))?.editHead).toEqual(head);
  const undone = { ...history, cursor: 0 };
  await saveEditCommit("history", baseline, head, undone);
  expect((await getRecording("history"))?.editHistory).toEqual(undone);
});
