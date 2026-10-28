import { BUILD_INFO } from "./build-info";
import { encodeAudio } from "./codec";
import type { CaptureMeta, AudioRecording as Recording, RecordingOrigin } from "./db";
import { DEFAULT_PRESET, resolveKnobs } from "./melody/knobs";
import { newRecordingMelody } from "./melody/settings";
import { analysisOptionsFor, getSoundProfile, SOUND_PROFILES } from "./recording-profiles";
import { validTempo } from "./recording-setup";
import { summarizeWaveform } from "./waveform";
import { encodeWav, type WavChunk } from "./wav";
import { decodeWav, wavChunks } from "./wav-reader";

// A diapason WAV carries the recording as it was captured, so another browser can
// rebuild the unedited take. Editor state (melody, note edits, muting) is never written.

export const METADATA_CHUNK = "dpsn";
const METADATA_SCHEMA = 1;

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

const UNTAGGED = "Only WAVs exported from diapason can be imported for now.";
const NEWER = "This WAV was exported by a newer diapason. Update diapason and try again.";
const DAMAGED = "This WAV's diapason data is damaged or unsupported.";
const NOT_RECORDING = "This diapason WAV is not a recording, so it can't be imported.";

export function recordingMetadata(record: Recording, context: ExportContext): WavMetadata {
  const whistle = getSoundProfile("whistle");
  const previous = record.imported?.metadata;
  return {
    // An imported file's fields come first, so ones this build does not know survive re-export.
    ...previous,
    app: "diapason",
    schemaVersion: METADATA_SCHEMA,
    kind: "recording",
    recording: {
      ...previous?.recording,
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      bpm: record.bpm,
      beatsPerBar: record.beatsPerBar,
      downbeatSample: 0,
      source: record.source ?? { profileId: whistle.id, analysis: { ...whistle.analysis } },
      capture: {
        ...record.capture,
        rmsGate:
          record.capture.rmsGate ??
          record.tuning?.rmsGate ??
          resolveKnobs(DEFAULT_PRESET, {}).levelGate,
      },
    },
    provenance: previous?.provenance ?? { build: BUILD_INFO, ...context },
  };
}

const utf8 = (value: string) => new TextEncoder().encode(value);

function infoChunk(meta: WavMetadata): WavChunk {
  const { name, createdAt, bpm, beatsPerBar, source } = meta.recording;
  const { version, revision } = meta.provenance.build;
  const fields: [string, string][] = [
    ["INAM", name],
    ["ICRD", new Date(createdAt).toISOString()],
    ["ISFT", `diapason ${version} (${revision})`],
    ["ICMT", `${bpm} BPM, ${beatsPerBar}/4, ${source.profileId}`],
  ];
  const parts = fields.map(([id, value]) => [id, utf8(`${value}\0`)] as const);
  const size = parts.reduce((total, [, data]) => total + 8 + data.length + (data.length % 2), 4);
  const data = new Uint8Array(size);
  const view = new DataView(data.buffer);
  data.set(utf8("INFO"));
  let offset = 4;
  for (const [id, value] of parts) {
    data.set(utf8(id), offset);
    view.setUint32(offset + 4, value.length, true);
    data.set(value, offset + 8);
    offset += 8 + value.length + (value.length % 2);
  }
  return { id: "LIST", data };
}

/** ACID loop info, which some DAWs read to place the file at its tempo. */
function acidChunk(meta: WavMetadata, durationSec: number): WavChunk {
  const { bpm, beatsPerBar } = meta.recording;
  const data = new Uint8Array(24);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0, true); // flags: no root note, not a one-shot
  view.setUint16(4, 60, true); // root note
  view.setUint16(6, 0x8000, true);
  view.setFloat32(8, 0, true);
  view.setUint32(12, Math.round((durationSec * bpm) / 60), true);
  view.setUint16(16, 4, true);
  view.setUint16(18, beatsPerBar, true);
  view.setFloat32(20, bpm, true);
  return { id: "acid", data };
}

function metadataChunks(meta: WavMetadata, durationSec: number): WavChunk[] {
  return [
    { id: METADATA_CHUNK, data: utf8(JSON.stringify(meta)) },
    infoChunk(meta),
    acidChunk(meta, durationSec),
  ];
}

export function taggedWavChunks(
  record: Recording,
  pcm: Float32Array,
  context: ExportContext,
): WavChunk[] {
  return metadataChunks(recordingMetadata(record, context), pcm.length / record.sampleRate);
}

export function encodeTaggedWav(
  record: Recording,
  pcm: Float32Array,
  context: ExportContext,
): Blob {
  return encodeWav(pcm, record.sampleRate, taggedWavChunks(record, pcm, context));
}

function readPayload(bytes: ArrayBuffer) {
  try {
    const { sampleRate, pcm } = decodeWav(bytes);
    const chunk = wavChunks(bytes).find(({ id }) => id === METADATA_CHUNK);
    if (!chunk) throw new Error(UNTAGGED);
    const text = new TextDecoder().decode(new Uint8Array(bytes, chunk.start, chunk.length));
    const payload = JSON.parse(text) as Record<string, unknown> | null;
    if (payload?.app !== "diapason") throw new Error(UNTAGGED);
    return { sampleRate, pcm, payload };
  } catch {
    throw new Error(UNTAGGED);
  }
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

type Fields = WavMetadata["recording"];

/** The same tempo range capture allows; anything else would stall the editor's beat grid. */
const validTake = (r: Fields, samples: number) =>
  typeof r.id === "string" &&
  r.id !== "" &&
  typeof r.name === "string" &&
  Number.isFinite(new Date(r.createdAt).getTime()) &&
  validTempo(r.bpm, r.beatsPerBar) &&
  Number.isInteger(r.downbeatSample) &&
  r.downbeatSample >= 0 &&
  r.downbeatSample < samples;

const validCapture = (capture: Partial<Fields["capture"]> = {}) =>
  [capture.gain, capture.peak, capture.noiseFloor, capture.rmsGate].every(finite) &&
  typeof capture.dspOff === "boolean";

/** Only a profile and settings this build analyses as written; a fallback would change the notes. */
const validSource = (source: Fields["source"] | undefined) =>
  !!source &&
  SOUND_PROFILES.some((profile) => profile.id === source.profileId) &&
  analysisOptionsFor({ source }) === source.analysis;

const strings = (...values: unknown[]) => values.every((value) => typeof value === "string");

/** Provenance is shown and re-exported, so every field must have its declared type. */
const validOrigin = ({ build, browser, audioOutput, midiOutput }: RecordingOrigin) =>
  strings(build.version, build.revision, build.source, browser, audioOutput, midiOutput) &&
  finite(build.pipeline);

function validMetadata(meta: WavMetadata, samples: number): boolean {
  const r = meta.recording;
  // Property access on a malformed payload throws; any such shape is damaged data.
  try {
    return (
      validTake(r, samples) &&
      validCapture(r.capture) &&
      validSource(r.source) &&
      validOrigin(meta.provenance)
    );
  } catch {
    return false;
  }
}

/** Rebuild the unedited take from a diapason WAV; errors carry a message for the user. */
export async function recordingFromTaggedWav(
  bytes: ArrayBuffer,
  fileName: string,
): Promise<Recording> {
  const { sampleRate, pcm, payload } = readPayload(bytes);
  if (!finite(payload.schemaVersion)) throw new Error(DAMAGED);
  if (payload.schemaVersion > METADATA_SCHEMA) throw new Error(NEWER);
  if (typeof payload.kind !== "string") throw new Error(DAMAGED);
  if (payload.kind !== "recording") throw new Error(NOT_RECORDING);
  const meta = payload as unknown as WavMetadata;
  if (!validMetadata(meta, pcm.length)) throw new Error(DAMAGED);
  const { id, name, createdAt, bpm, beatsPerBar, downbeatSample, source, capture } = meta.recording;
  const audio = pcm.subarray(downbeatSample);
  return {
    id,
    name,
    createdAt,
    sampleRate,
    durationSec: audio.length / sampleRate,
    bpm,
    beatsPerBar,
    source,
    audio: await encodeAudio(audio),
    waveform: summarizeWaveform(audio),
    capture,
    melody: newRecordingMelody(capture.rmsGate),
    imported: { at: Date.now(), fileName, metadata: meta },
  };
}
