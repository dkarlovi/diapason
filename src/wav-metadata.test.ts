// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILD_INFO } from "./build-info";
import { decodeAudio } from "./codec";
import type { Recording } from "./db";
import { newRecordingMelody } from "./melody/settings";
import { recording } from "./test-support/recording";
import { encodeWav } from "./wav";
import {
  encodeTaggedWav,
  METADATA_CHUNK,
  recordingFromTaggedWav,
  recordingMetadata,
  type WavMetadata,
} from "./wav-metadata";
import { wavChunks } from "./wav-reader";
import { getSoundProfile } from "./recording-profiles";

const context = { browser: "UA", audioOutput: "unknown", midiOutput: "Browser synth" };
const pcm = Float32Array.from([0, 0.25, -0.5, 0.5, -0.25], (sample) => sample);
const whistle = {
  profileId: "whistle",
  analysis: { windowSize: 2048, hop: 512, minFreq: 250, maxFreq: 3000, clarityThreshold: 0.9 },
};
const take = (overrides: Partial<Recording> = {}) =>
  recording({
    id: "abc",
    name: "Take",
    createdAt: 1792768375650,
    sampleRate: 48000,
    durationSec: pcm.length / 48000,
    bpm: 94,
    beatsPerBar: 3,
    source: whistle,
    capture: { gain: 1, peak: 0.5, noiseFloor: 0.001, rmsGate: 0.004, dspOff: true },
    ...overrides,
  });
const bytes = (blob: Blob) => blob.arrayBuffer();
const text = (buffer: ArrayBuffer, start: number, length: number) =>
  new TextDecoder().decode(new Uint8Array(buffer, start, length));
const withPayload = (payload: unknown) =>
  bytes(
    encodeWav(pcm, 48000, [
      { id: METADATA_CHUNK, data: new TextEncoder().encode(JSON.stringify(payload)) },
    ]),
  );
const tamper = (change: (meta: WavMetadata) => void) => {
  const meta = structuredClone(recordingMetadata(take(), context));
  change(meta);
  return withPayload(meta);
};
const parse = (buffer: ArrayBuffer, fileName = "take.wav") =>
  recordingFromTaggedWav(buffer, fileName);
const UNTAGGED = "Only WAVs exported from diapason can be imported for now.";
const DAMAGED = "This WAV's diapason data is damaged or unsupported.";

describe("tagged WAV", () => {
  it("preserves a calibrated voice range and refuses malformed preferred bounds", async () => {
    const source = {
      profileId: "voice-experimental",
      analysis: {
        ...getSoundProfile("voice-experimental").analysis,
        preferredRange: { minFreq: 100, maxFreq: 500 },
      },
    };
    const rec = take({ source });
    const result = await parse(await bytes(encodeTaggedWav(rec, pcm, context)));
    expect(result.source).toEqual(source);
    const meta = recordingMetadata(rec, context);
    for (const preferredRange of [
      { minFreq: 500, maxFreq: 100 },
      { minFreq: 1, maxFreq: 500 },
      { minFreq: 100, maxFreq: 1600 },
      { minFreq: 100 },
    ]) {
      const invalid = structuredClone(meta);
      Object.assign(invalid.recording.source.analysis, { preferredRange });
      await expect(parse(await withPayload(invalid))).rejects.toThrow(DAMAGED);
    }
  });
  it("round-trips recording-time fields", async () => {
    const before = Date.now();
    const result = await parse(await bytes(encodeTaggedWav(take(), pcm, context)), "take.wav");
    expect(result).toMatchObject({
      id: "abc",
      name: "Take",
      createdAt: 1792768375650,
      bpm: 94,
      beatsPerBar: 3,
      sampleRate: 48000,
      durationSec: pcm.length / 48000,
      source: whistle,
      capture: { gain: 1, peak: 0.5, noiseFloor: 0.001, rmsGate: 0.004, dspOff: true },
      melody: newRecordingMelody(0.004),
      imported: { fileName: "take.wav", metadata: recordingMetadata(take(), context) },
    });
    expect(result.imported!.metadata.provenance).toEqual({ build: BUILD_INFO, ...context });
    expect(result.imported!.at).toBeGreaterThanOrEqual(before);
    expect([...(await decodeAudio(result.audio))]).toEqual([...pcm]);
    expect(result.waveform).toBeDefined();
  });

  it("ignores editor state", async () => {
    const edited = take({
      melody: { preset: "syncopated", key: "auto", overrides: { levelGate: 0.05 } },
      muted: [{ t: 0, midi: 60 }],
      quantize: { on: true, subdivision: 2 },
      play: { instrument: "beep", octave: -1 },
      noteEdits: { version: 1, pitch: [] },
    });
    const result = await parse(await bytes(encodeTaggedWav(edited, pcm, context)));
    for (const key of ["muted", "quantize", "play", "noteEdits", "tuning"] as const)
      expect(result[key]).toBeUndefined();
    expect(result.melody).toEqual(newRecordingMelody(0.004));
  });

  it("exports legacy recordings with resolved gate and whistle source", () => {
    const { source: _source, ...unsourced } = take({
      capture: { gain: 1, peak: 0.5, noiseFloor: 0.001, dspOff: true },
      tuning: { rmsGate: 0.006 },
    });
    const legacy: Recording = unsourced;
    const meta = recordingMetadata(legacy, context);
    expect(meta.recording.capture.rmsGate).toBe(0.006);
    expect(meta.recording.source.profileId).toBe("whistle");
    expect(recordingMetadata({ ...legacy, tuning: {} }, context).recording.capture.rmsGate).toBe(
      0.003,
    );
  });

  it("keeps the original provenance on re-export", () => {
    const origin = {
      build: { version: "0.0.1", revision: "abc1234", source: "pages", pipeline: 3 },
      browser: "Firefox",
      audioOutput: "unknown",
      midiOutput: "Synth",
    };
    const metadata = { ...recordingMetadata(take(), context), provenance: origin };
    const imported = take({ imported: { at: 1, fileName: "shared.wav", metadata } });
    expect(recordingMetadata(imported, context).provenance).toEqual(origin);
  });

  it("stores the embedded metadata exactly as it arrived", async () => {
    const meta = { ...recordingMetadata(take(), context), future: { mood: "calm" } };
    const result = await parse(await withPayload(meta), "future.wav");
    expect(result.imported!.metadata).toEqual(meta);
  });

  it("re-exports an imported recording byte for byte", async () => {
    const first = await bytes(encodeTaggedWav(take(), pcm, context));
    const imported = await parse(first);
    const audio = await decodeAudio(imported.audio);
    const other = { browser: "Other", audioOutput: "x", midiOutput: "y" };
    const second = await bytes(encodeTaggedWav(imported, audio, other));
    expect(new Uint8Array(second)).toEqual(new Uint8Array(first));
  });

  it("keeps metadata fields this build does not know on re-export", async () => {
    const meta = { ...recordingMetadata(take(), context), future: { mood: "calm" } };
    const imported = await parse(await withPayload(meta));
    const again = await bytes(
      encodeTaggedWav(imported, await decodeAudio(imported.audio), context),
    );
    expect((await parse(again)).imported!.metadata).toEqual(meta);
  });

  it("writes INFO and acid chunks", async () => {
    const buffer = await bytes(encodeTaggedWav(take(), pcm, context));
    const chunks = wavChunks(buffer);
    expect(chunks.map((chunk) => chunk.id)).toEqual(["fmt ", "data", "dpsn", "LIST", "acid"]);
    const list = chunks.find((chunk) => chunk.id === "LIST")!;
    const info = text(buffer, list.start, list.length);
    expect(info.startsWith("INFO")).toBe(true);
    expect(info).toContain("INAM");
    expect(info).toContain("Take\0");
    expect(info).toContain("ISFT");
    expect(info).toContain("diapason ");
    expect(info).toContain("94 BPM, 3/4, whistle");
    const acid = chunks.find((chunk) => chunk.id === "acid")!;
    const view = new DataView(buffer, acid.start, acid.length);
    expect(acid.length).toBe(24);
    expect(view.getUint32(12, true)).toBe(Math.round(((pcm.length / 48000) * 94) / 60));
    expect(view.getUint16(16, true)).toBe(4);
    expect(view.getUint16(18, true)).toBe(3);
    expect(view.getFloat32(20, true)).toBe(94);
  });

  it("round-trips a non-ASCII name with odd-length payload", async () => {
    const name = ["Pjesma č", "Pjesma č!"].find(
      (candidate) =>
        new TextEncoder().encode(
          JSON.stringify(recordingMetadata(take({ name: candidate }), context)),
        ).length % 2,
    )!;
    expect(name).toBeDefined();
    const buffer = await bytes(encodeTaggedWav(take({ name }), pcm, context));
    expect(new DataView(buffer).getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect((await parse(buffer)).name).toBe(name);
  });

  it("rejects untagged and foreign files", async () => {
    await expect(parse(await bytes(encodeWav(pcm, 48000)))).rejects.toThrow(UNTAGGED);
    await expect(parse(Uint8Array.of(1, 2, 3, 4).buffer)).rejects.toThrow(UNTAGGED);
    await expect(parse(await withPayload({ app: "other" }))).rejects.toThrow(UNTAGGED);
  });

  it("marks exports as recordings and refuses other kinds", async () => {
    expect(recordingMetadata(take(), context).kind).toBe("recording");
    await expect(
      parse(await tamper((meta) => Object.assign(meta, { kind: "render" }))),
    ).rejects.toThrow("This diapason WAV is not a recording, so it can't be imported.");
    await expect(
      parse(await tamper((meta) => delete (meta as Partial<WavMetadata>).kind)),
    ).rejects.toThrow(DAMAGED);
  });

  it("rejects newer schema", async () => {
    await expect(
      parse(await tamper((meta) => Object.assign(meta, { schemaVersion: 2 }))),
    ).rejects.toThrow("This WAV was exported by a newer diapason. Update diapason and try again.");
  });

  it.each([
    ["unknown profile", (meta: WavMetadata) => (meta.recording.source.profileId = "kazoo")],
    ["invalid analysis", (meta: WavMetadata) => (meta.recording.source.analysis.hop = 0)],
    ["zero tempo", (meta: WavMetadata) => (meta.recording.bpm = 0)],
    ["absurd tempo", (meta: WavMetadata) => (meta.recording.bpm = 1e9)],
    ["too many beats per bar", (meta: WavMetadata) => (meta.recording.beatsPerBar = 70000)],
    ["unrepresentable date", (meta: WavMetadata) => (meta.recording.createdAt = 1e300)],
    ["empty provenance", (meta: WavMetadata) => Object.assign(meta, { provenance: {} })],
    [
      "non-string version",
      (meta: WavMetadata) => Object.assign(meta.provenance.build, { version: { x: 1 } }),
    ],
    ["null capture", (meta: WavMetadata) => Object.assign(meta.recording, { capture: null })],
    ["negative downbeat", (meta: WavMetadata) => (meta.recording.downbeatSample = -1)],
    [
      "missing id",
      (meta: WavMetadata) => delete (meta.recording as Partial<typeof meta.recording>).id,
    ],
  ])("rejects damaged metadata: %s", async (_, change) => {
    await expect(parse(await tamper(change))).rejects.toThrow(DAMAGED);
  });

  it("trims audio before a non-zero downbeat", async () => {
    const result = await parse(await tamper((meta) => (meta.recording.downbeatSample = 2)));
    expect(result.durationSec).toBe(3 / 48000);
  });
});
