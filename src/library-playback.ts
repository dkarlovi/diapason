import type { Recording } from "./Recording/Recording.type";
import { decodeAudio } from "./codec";
import { requestAnalysis } from "./analysis-jobs";
import { playNotes, playPcm } from "./playback";
import { recordingNotes } from "./recording";
import type { Playback } from "./Playback/Playback.type";

/** Prepare without starting: the owning hook checks its navigation/request token first. */
export async function prepareLibraryPlayback(
  record: Recording,
  kind: "audio" | "midi",
  decoded: Map<string, { pcm: Float32Array }>,
): Promise<() => Playback> {
  if (kind === "midi") {
    const frames = record.noteSource ? [] : await requestAnalysis(record);
    const notes = recordingNotes(record, frames);
    return () => playNotes(notes, record.durationSec, record.play);
  }
  if (record.noteSource) throw new Error("The original audio was not included.");
  let audio = decoded.get(record.id);
  if (!audio) {
    audio = { pcm: await decodeAudio(record.audio) };
    decoded.set(record.id, audio);
  }
  const pcm = audio.pcm;
  return () => playPcm(pcm, record.sampleRate);
}
