import { databaseTransaction } from "../Storage/Database";
import type { Recording } from "./Recording.type";
import type { ImportDisposition } from "./RecordingPackage.type";
export async function insertImportedRecording(
  record: Recording,
  disposition: ImportDisposition,
): Promise<Recording> {
  const saved = disposition === "copy" ? { ...record, id: crypto.randomUUID() } : record;
  try {
    return await databaseTransaction(["recordings"], "readwrite", (tx, result) => {
      tx.objectStore("recordings").add(saved);
      result(saved);
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "ConstraintError")
      throw new Error("This recording already exists. Import as copy to keep both.");
    throw error;
  }
}
