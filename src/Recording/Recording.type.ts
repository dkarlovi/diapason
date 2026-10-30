import type { NoteEdits } from "../Editing/NoteEdits";
import type { PlaySettings } from "../Playback/Instruments";
import type { WaveformSummary } from "../Audio/Waveform";
import type { RecordingPackageV2, TuneImportMode } from "./RecordingPackage.type";
import type { SoundProfile } from "./SoundProfile.type";
import type { EditHead } from "./RecordingEdit.type";
import type { EditHistory } from "./RecordingEdit.type";
import type { NoteSource } from "./NoteSource.type";
import type { MelodySetting } from "../Melody/MelodySetting.type";
import type { WavMetadata } from "./WavMetadata.type";

export interface CaptureMeta {
  gain: number;
  peak: number;
  noiseFloor: number;
  rmsGate?: number;
  dspOff: boolean;
}

/** Where a recording was first made: the build and the browser it was recorded in. */
export interface RecordingOrigin {
  build: { version: string; revision: string; source: string; pipeline: number };
  browser: string;
  audioOutput: string;
  midiOutput: string;
}

/** A note the user switched off. Anchored to the midpoint of the raw (unquantized) note
 *  rather than an index, so it still finds "its" note after re-tuning re-segments the recording. */
export interface MutedNote {
  t: number;
  midi: number;
}

export interface QuantizeSetting {
  on: boolean;
  /** Grid divisions per beat (see quantize.ts). */
  subdivision: number;
}

interface RecordingFields {
  editHead?: EditHead;
  editHistory?: EditHistory;
  noteEdits?: NoteEdits;
  id: string;
  name: string;
  createdAt: number;
  durationSec: number;
  bpm: number;
  beatsPerBar: number;
  /** Gzipped Int16 PCM (see codec.ts). Audio t=0 is the downbeat. */
  melody?: MelodySetting;
  /** Legacy fields are read only to migrate older saved recordings. */
  tuning?: Partial<{
    rmsGate: number;
    clarityThreshold: number;
    minDurationSec: number;
    silenceGapSec: number;
    medianWindow: number;
    changeDebounceSec: number;
    hysteresisSemitones: number;
  }>;
  muted?: MutedNote[];
  quantize?: QuantizeSetting;
  /** How ▶ MIDI sounds for this recording (playback only; the .mid is unaffected). */
  play?: PlaySettings;
  /** Set when the recording came from a diapason WAV. */
  imported?: RecordingImport;
}

export interface AudioRecording extends RecordingFields {
  audio: Blob;
  sampleRate: number;
  capture: CaptureMeta;
  waveform?: WaveformSummary;
  source?: { profileId: string; analysis: SoundProfile["analysis"] };
  noteSource?: never;
}
export interface NoteRecording extends RecordingFields {
  noteSource: NoteSource;
  audio?: never;
  sampleRate?: never;
  capture?: never;
  waveform?: never;
  source?: never;
}
export type Recording = AudioRecording | NoteRecording;
interface RecordingImport {
  /** When it was saved into this library. */
  at: number;
  fileName: string;
  /** The file's embedded metadata exactly as it arrived, including fields this build does not
   *  know. Its provenance is written back unchanged when the recording is exported again. */
  metadata: WavMetadata | RecordingPackageV2;
  tuneMode?: TuneImportMode;
  sourceId?: string;
}
