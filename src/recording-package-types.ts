import type { AudioRecording, RecordingOrigin } from "./Recording/Recording.type";
import type { buildReportData } from "./diagnostics";
import type { EditSnapshot } from "./edit-state";
import type { Frame } from "./notes";
import type { PortableTune } from "./portable-tune";
import type { ExportContext, WavMetadata } from "./wav-metadata";
export type TuneImportMode = "restore" | "fresh";
export type ImportDisposition = "original" | "copy";
export type ProcessingEvidence = Pick<
  ReturnType<typeof buildReportData>,
  "settings" | "analysis" | "stages" | "config" | "quality" | "notes"
>;
export interface RecordingPackageV2 {
  app: "diapason";
  schemaVersion: 2;
  kind: "recording";
  recording: WavMetadata["recording"] & { sourceId: string };
  provenance: RecordingOrigin;
  exported: { at: number; context: RecordingOrigin };
  audio: {
    format: "pcm16-mono";
    sampleCount: number;
    sampleRate: number;
    timelineOrigin: "recording-downbeat";
    sha256: string;
  };
  intent: EditSnapshot;
  tune: PortableTune;
  midiBytes: number[];
  frames: Frame[];
  evidence: ProcessingEvidence;
}
export interface CapturedRecordingPackage {
  record: AudioRecording;
  pcm: Float32Array;
  frames: Frame[];
  intent: EditSnapshot;
  tune: PortableTune;
  evidence: ProcessingEvidence;
  context: ExportContext;
  exportedAt: number;
}
export interface ReadRecordingPackage {
  metadata: WavMetadata | RecordingPackageV2;
  pcm: Float32Array;
  sampleRate: number;
}
