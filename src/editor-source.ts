import type { AdHocTuneSession } from "./ad-hoc-session";
import { getRecording, type Recording } from "./db";
import { flushEditorSaves } from "./editor-save-queue";
import { decodeAudio } from "./codec";
import { validateNoteSource } from "./note-source";
import { requestAnalysis } from "./analysis-jobs";
import { qualityStats, type QualityStats } from "./recorder";
import type { Frame } from "./notes";
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
