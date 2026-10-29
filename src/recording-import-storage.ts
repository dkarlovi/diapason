import { databaseTransaction } from "./db-connection";
import type { Recording } from "./db";
import type { ImportDisposition } from "./recording-package-types";
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
