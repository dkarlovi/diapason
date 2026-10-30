import type { InvestigationContext } from "../../src/Inspection/Inspection.type";
import type { AudioRecording } from "../../src/db";
import { floatToPcm16, pcm16ToFloat } from "../../src/pcm";
import { recording } from "./recording";
import { analyzeRecording } from "../../src/recording-analysis";
import {
  captureRecordingPackage,
  encodeRecordingPackage,
  readRecordingPackage,
} from "../../src/recording-package";
export async function investigationInput(
  name = "Whistle | Δ",
  overrides: Partial<AudioRecording> = {},
) {
  const pcm = Float32Array.from(
    { length: 24000 },
    (_, i) => 0.2 * Math.sin((2 * Math.PI * 1000 * i) / 48000),
  );
  const canonicalPcm = pcm16ToFloat(floatToPcm16(pcm));
  const record = recording({ name, sampleRate: 48000, durationSec: 0.5, ...overrides });
  const frames = analyzeRecording(canonicalPcm, 48000, record);
  const blob = await encodeRecordingPackage(
    captureRecordingPackage(
      record,
      canonicalPcm,
      frames,
      { browser: "test", audioOutput: "unknown", midiOutput: "Browser synth" },
      1,
    ),
  );
  const bytes = await blob.arrayBuffer();
  return { bytes, input: await readRecordingPackage(bytes) };
}

export async function investigationContext(): Promise<{
  bytes: ArrayBuffer;
  context: InvestigationContext;
}> {
  const { BUILD_INFO } = await import("../../src/build-info");
  const { input, bytes } = await investigationInput();
  const cache = new Map<string, unknown>();
  return {
    bytes,
    context: {
      input,
      identity: {
        path: "/tmp/test recording.wav",
        wavSha256: "a".repeat(64),
        pcmSha256: input.metadata.schemaVersion === 2 ? input.metadata.audio.sha256 : null,
        sampleRate: input.sampleRate,
        sampleCount: input.pcm.length,
      },
      execution: {
        codeRuntimeKey: "test",
        runKey: "test-run",
        build: BUILD_INFO,
        pipelineVersion: BUILD_INFO.pipeline,
        interpretationVersion: 1,
      },
      stages: {
        read: async (key: string) => cache.get(key),
        write: async (key: string, value: unknown) => {
          cache.set(key, value);
        },
      },
    },
  };
}
