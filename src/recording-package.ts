import { PackageError, packageError } from "./package-error";
import { mergePackageExtensions } from "./recording-package-extensions";
import { encodeTuneMidi } from "./tune-midi";
import type { AudioRecording } from "./db";
import { BUILD_INFO } from "./build-info";
import { encodeAudio } from "./codec";
import { buildReportData } from "./diagnostics";
import { sha256 } from "./sha256";
import { captureEditSnapshot, applyEditSnapshot } from "./edit-state";
import { makeReportInput } from "./editor-model";
import { newRecordingMelody } from "./melody/settings";
import type { Frame } from "./notes";
import { createPortableTune } from "./portable-tune";
import { qualityStats } from "./recorder";
import type {
  CapturedRecordingPackage,
  ReadRecordingPackage,
  TuneImportMode,
} from "./recording-package-types";
import {
  MAX_PACKAGE_METADATA_BYTES,
  validateRecordingPackage,
} from "./recording-package-validation";
import { summarizeWaveform } from "./waveform";
import { wavBytes } from "./wav";
import { decodeWav, wavChunks } from "./wav-reader";
import {
  METADATA_CHUNK,
  metadataChunks,
  recordingMetadata,
  validMetadata,
  type ExportContext,
  type WavMetadata,
} from "./wav-metadata";

export function captureRecordingPackage(
  record: AudioRecording,
  pcm: Float32Array,
  frames: Frame[],
  context: ExportContext,
  exportedAt: number,
): CapturedRecordingPackage {
  const report = buildReportData(makeReportInput(record, frames, qualityStats(frames, pcm)));
  const { settings, analysis, stages, config, quality, notes } = report;
  return structuredClone({
    record,
    pcm,
    frames,
    intent: {
      ...captureEditSnapshot(record),
      intent: {
        ...captureEditSnapshot(record).intent,
        melody: settings.melody,
        play: settings.play,
      },
    },
    tune: createPortableTune(record, frames),
    evidence: { settings, analysis, stages, config, quality, notes },
    context,
    exportedAt,
  });
}
export async function encodeRecordingPackage(snapshot: CapturedRecordingPackage): Promise<Blob> {
  const { record, pcm, frames, context, exportedAt, intent, tune, evidence } = snapshot;
  const plain = wavBytes(pcm, record.sampleRate);
  const original = recordingMetadata(record, context);
  const metadata = validateRecordingPackage(
    mergePackageExtensions(record.imported?.metadata, {
      ...original,
      schemaVersion: 2 as const,
      recording: { ...original.recording, sourceId: record.imported?.sourceId ?? record.id },
      midiBytes: Array.from(new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer())),
      exported: { at: exportedAt, context: { ...context, build: BUILD_INFO } },
      audio: {
        format: "pcm16-mono" as const,
        sampleCount: pcm.length,
        sampleRate: record.sampleRate,
        timelineOrigin: "recording-downbeat" as const,
        sha256: await sha256(plain.slice(44)),
      },
      intent,
      tune,
      frames,
      evidence,
    }),
    pcm.length,
    record.sampleRate,
  );
  const chunks = metadataChunks(original, pcm.length / record.sampleRate);
  chunks[0] = { id: METADATA_CHUNK, data: new TextEncoder().encode(JSON.stringify(metadata)) };
  if (chunks[0].data.length > MAX_PACKAGE_METADATA_BYTES)
    throw new Error("Recording metadata is too large to export.");
  return new Blob([wavBytes(pcm, record.sampleRate, chunks)], { type: "audio/wav" });
}
export async function readRecordingPackage(bytes: ArrayBuffer): Promise<ReadRecordingPackage> {
  try {
    return await readPackage(bytes);
  } catch (error) {
    throw packageError(error, "wav", "wav.container");
  }
}
async function readPackage(bytes: ArrayBuffer): Promise<ReadRecordingPackage> {
  const chunks = wavChunks(bytes);
  const found = chunks.filter((c) => c.id === METADATA_CHUNK);
  if (!found.length) throw new Error("Only WAVs exported from diapason can be imported for now.");
  if (
    found.length !== 1 ||
    chunks.filter((c) => c.id === "data").length !== 1 ||
    chunks.filter((c) => c.id === "fmt ").length !== 1
  )
    throw new PackageError("malformed", "wav.chunks", "wav.unique-chunks", "Duplicate WAV chunks.");
  const chunk = found[0]!;
  if (chunk.length > MAX_PACKAGE_METADATA_BYTES)
    throw new Error("Recording metadata is too large.");
  const payload = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, chunk.start, chunk.length)),
  ) as WavMetadata;
  const { sampleRate, pcm } = decodeWav(bytes);
  if (payload?.app !== "diapason" || payload.kind !== "recording")
    throw new Error("This WAV is not a diapason recording.");
  if (payload.schemaVersion === 1) {
    if (!validMetadata(payload, pcm.length))
      throw new Error("This WAV's diapason data is damaged or unsupported.");
    return { metadata: payload, pcm, sampleRate };
  }
  if (Number(payload.schemaVersion) > 2)
    throw new PackageError(
      "unsupported",
      "schemaVersion",
      "package.schema",
      "This WAV was exported by a newer diapason. Update diapason and try again.",
    );
  const metadata = validateRecordingPackage(payload, pcm.length, sampleRate);
  const data = chunks.find((c) => c.id === "data")!;
  if ((await sha256(bytes.slice(data.start, data.start + data.length))) !== metadata.audio.sha256)
    throw new PackageError(
      "malformed",
      "audio.sha256",
      "pcm.identity",
      "WAV audio does not match its saved SHA-256.",
      {
        schemaVersion: metadata.schemaVersion,
        interpretationVersion: metadata.tune.noteSource.interpretationVersion,
        build: metadata.exported.context.build,
      },
    );
  return { metadata, pcm, sampleRate };
}
export async function restoreRecordingPackage(
  input: ReadRecordingPackage,
  fileName: string,
  mode: TuneImportMode,
): Promise<AudioRecording> {
  const { metadata, sampleRate } = input;
  const { id, name, createdAt, bpm, beatsPerBar, downbeatSample, source, capture } =
    metadata.recording;
  const pcm = input.pcm.subarray(downbeatSample);
  const record: AudioRecording = {
    id,
    name,
    createdAt,
    bpm,
    beatsPerBar,
    sampleRate,
    durationSec: pcm.length / sampleRate,
    source: structuredClone(source),
    capture: structuredClone(capture),
    audio: await encodeAudio(pcm),
    waveform: summarizeWaveform(pcm),
    melody: newRecordingMelody(capture.rmsGate),
    imported: {
      at: Date.now(),
      fileName,
      metadata: structuredClone(metadata),
      tuneMode: metadata.schemaVersion === 2 ? mode : "fresh",
      sourceId: metadata.schemaVersion === 2 ? metadata.recording.sourceId : id,
    },
  };
  return metadata.schemaVersion === 2 && mode === "restore"
    ? (applyEditSnapshot(record, metadata.intent) as AudioRecording)
    : record;
}
