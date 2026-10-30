import type { AudioRecording as Recording, CaptureMeta, RecordingOrigin } from "./Recording.type";

export type ExportContext = Omit<RecordingOrigin, "build">;

export interface WavMetadata {
  app: "diapason";
  schemaVersion: 1;
  /** Only recordings rebuild a take; other kinds (such as a rendered melody) must never import as one. */
  kind: "recording";
  recording: {
    id: string;
    name: string;
    createdAt: number;
    bpm: number;
    beatsPerBar: number;
    /** Sample where beat 1 falls; our own recordings always start on it. */
    downbeatSample: number;
    source: NonNullable<Recording["source"]>;
    capture: CaptureMeta & { rmsGate: number };
  };
  provenance: RecordingOrigin;
}
