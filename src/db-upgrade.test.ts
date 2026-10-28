import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { recording } from "./test-support/recording";
import { openDatabase } from "./db-connection";
import { getRecording } from "./db";
import { readAnalysis, writeAnalysis } from "./analysis-cache";

it("upgrades an existing library without losing recordings or saved versions", async () => {
  const legacy = recording({ id: "upgrade", name: "Existing take" });
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("diapason", 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("recordings", { keyPath: "id" }).put(legacy);
      const versions = request.result.createObjectStore("versions", { keyPath: "id" });
      versions.createIndex("recordingId", "recordingId");
      versions.createIndex("recordingName", ["recordingId", "nameKey"], { unique: true });
      versions.put({ id: "version", recordingId: legacy.id, nameKey: "first" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  old.close();
  const db = await openDatabase();
  expect(db.version).toBe(3);
  expect((await getRecording(legacy.id))?.name).toBe("Existing take");
  const version = await new Promise((resolve) => {
    const request = db.transaction("versions").objectStore("versions").get("version");
    request.onsuccess = () => resolve(request.result);
  });
  expect(version).toMatchObject({ id: "version", nameKey: "first" });
  await writeAnalysis(legacy, []);
  expect(await readAnalysis(legacy)).toEqual([]);
});
