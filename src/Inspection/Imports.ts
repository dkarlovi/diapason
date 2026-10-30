import { restoreRecordingPackage } from "../recording-package";
import { captureEditSnapshot } from "../edit-state";
import { newRecordingMelody } from "../melody/settings";
import { compareValues } from "../diagnostics-validation";
import type { ReadRecordingPackage } from "../Recording/RecordingPackage.type";
export async function verifyImportModes(input: ReadRecordingPackage) {
  const restoreRecord = await restoreRecordingPackage(input, "verification.wav", "restore");
  const freshRecord = await restoreRecordingPackage(input, "verification.wav", "fresh");
  const p = input.metadata;
  const restore = compareValues(
    p.schemaVersion === 2 ? p.intent : captureEditSnapshot(restoreRecord),
    captureEditSnapshot(restoreRecord),
    "restore.intent",
  );
  const expected = {
    melody: newRecordingMelody(p.recording.capture.rmsGate),
    noteEdits: undefined,
    muted: undefined,
    play: undefined,
    received: p,
  };
  const actual = {
    melody: freshRecord.melody,
    noteEdits: freshRecord.noteEdits,
    muted: freshRecord.muted,
    play: freshRecord.play,
    received: freshRecord.imported?.metadata,
  };
  return { restore, fresh: compareValues(expected, actual, "fresh"), restoreRecord, freshRecord };
}
