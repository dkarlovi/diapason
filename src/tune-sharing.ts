import { requestAnalysis } from "./analysis-jobs";
import { getRecording } from "./db";
import { flushEditorSaves } from "./editor-save-queue";
import { createPortableTune, type PortableTune } from "./portable-tune";
export async function loadShareTune(recordingId: string): Promise<PortableTune> {
  await flushEditorSaves(recordingId);
  const record = await getRecording(recordingId);
  if (!record) throw new Error("Recording not found.");
  return createPortableTune(record, record.noteSource ? [] : await requestAnalysis(record));
}
