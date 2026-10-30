import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { decodeAudio } from "../codec";
import type { Recording } from "../Recording/Recording.type";
import { saveWaveform } from "../Recording/Recording.storage";
import { summarizeWaveform } from "../waveform";

export function useLibraryRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  useWaveformBackfill(recordings, setRecordings);
  return [recordings, setRecordings] as const;
}

/** One decode at a time, yielding between takes and releasing PCM after each summary. */
export function useWaveformBackfill(
  recordings: Recording[],
  setRecordings: Dispatch<SetStateAction<Recording[]>>,
) {
  const latest = useRef(recordings);
  const attempted = useRef(new Set<string>());
  const work = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);

  useEffect(() => {
    return () => {
      generation.current++;
    };
  }, []);

  useEffect(() => {
    latest.current = recordings;
    const token = generation.current;
    const run = async () => {
      while (token === generation.current) {
        const record = latest.current.find(
          (r) => !r.noteSource && !r.waveform && !attempted.current.has(r.id),
        );
        if (!record || record.noteSource) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (token !== generation.current) return;
        attempted.current.add(record.id);
        try {
          const summary = summarizeWaveform(await decodeAudio(record.audio));
          if (token !== generation.current) return;
          const waveform = await saveWaveform(record.id, summary);
          if (token === generation.current && waveform) {
            setRecordings((current) =>
              current.map((r) => (r.id === record.id && !r.noteSource ? { ...r, waveform } : r)),
            );
          }
        } catch {
          // A failed legacy preview must not prevent playback or other summaries.
        }
      }
    };
    // Chain effects so reloads and StrictMode cannot launch overlapping decodes.
    work.current = work.current.then(run);
  }, [recordings, setRecordings]);
}
