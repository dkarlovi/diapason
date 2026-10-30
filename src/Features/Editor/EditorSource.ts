import type { AdHocTuneSession } from "./AdHocSession";
import type { Recording } from "../../Recording/Recording.type";
import { getRecording } from "../../Recording/Recording.storage";
import { flushEditorSaves } from "../../Editing/EditorSaveQueue";
import { decodeAudio } from "../../Audio/Codec";
import { validateNoteSource } from "../../Recording/NoteSource";
import { requestAnalysis } from "../../Analysis/AnalysisJobs";
import { qualityStats, type QualityStats } from "../../Audio/Recorder";
import type { Frame } from "../../Melody/Notes";
export async function loadEditorRecording(
  id: string,
  session?: AdHocTuneSession,
): Promise<Recording | undefined> {
  if (session) return session.getRecord();
  await flushEditorSaves(id);
  return getRecording(id);
}
export async function decodeEditorRecording(record: Recording): Promise<Float32Array<ArrayBuffer>> {
  if (!record.noteSource) return decodeAudio(record.audio);
  validateNoteSource(record.noteSource, record.durationSec);
  return new Float32Array(0);
}
export async function analyzeEditorRecording(
  record: Recording,
  pcm: Float32Array,
  retry: boolean,
): Promise<{ frames: Frame[]; stats: QualityStats | null }> {
  if (record.noteSource) return { frames: [], stats: null };
  const frames = await requestAnalysis(record, retry);
  return { frames, stats: qualityStats(frames, pcm) };
}
