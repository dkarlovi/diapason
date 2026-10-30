import { requestAnalysis } from "../Analysis/AnalysisJobs";
import { getRecording } from "../Recording/Recording.storage";
import { flushEditorSaves } from "../Editing/EditorSaveQueue";
import { createPortableTune } from "./PortableTune";
import type { PortableTune } from "./PortableTune.type";

export async function loadShareTune(recordingId: string): Promise<PortableTune> {
  await flushEditorSaves(recordingId);
  const record = await getRecording(recordingId);
  if (!record) throw new Error("Recording not found.");
  return createPortableTune(record, record.noteSource ? [] : await requestAnalysis(record));
}
