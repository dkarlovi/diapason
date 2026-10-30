// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { loadFixture } from "./test-support/fixtures";
import { processRecording } from "./recording";
import {
  captureRecordingPackage,
  encodeRecordingPackage,
  readRecordingPackage,
  restoreRecordingPackage,
} from "./recording-package";
import { validateRecordingPackage } from "./recording-package-validation";
import { encodeTuneMidi } from "./tune-midi";
import { createPortableTune } from "./portable-tune";
import { decodeAudio } from "./codec";
import { encodeTaggedWav } from "./wav-metadata";
import { wavChunks } from "./wav-reader";

const context = { browser: "test browser", audioOutput: "unknown", midiOutput: "Browser synth" };
let fixture: ReturnType<typeof loadFixture>;
beforeAll(() => {
  fixture = loadFixture("whistle-intro", 2);
}, 15000);
function snapshot(preset: "clean" | "auto-tune" = "clean") {
  const { record, pcm, frames } = fixture;
  const first = processRecording(record, frames).items[0]!;
  const edited = {
    ...record,
    melody: { preset, key: "auto" as const, overrides: {} },
    play: { instrument: "flute" as const, octave: -1 as const },
    noteEdits: {
      version: 1 as const,
      pitch: [
        { id: "visible", ranges: [first.source], midi: 72 },
        { id: "hidden", ranges: [{ start: 1.99, end: 2 }], midi: 60 },
      ],
    },
  };
  return captureRecordingPackage(edited, pcm, frames, context, 1234);
}
it.each(["clean", "auto-tune"] as const)(
  "round trips %s intent and unchanged audio while preserving exact downloadable MIDI",
  async (preset) => {
    const captured = snapshot(preset);
    const expected = await encodeTuneMidi(createPortableTune(captured.record, captured.frames));
    const blob = await encodeRecordingPackage(captured);
    const parsed = await readRecordingPackage(await blob.arrayBuffer());
    expect(parsed.metadata.schemaVersion).toBe(2);
    if (parsed.metadata.schemaVersion !== 2) throw new Error("expected package");
    expect(parsed.metadata.intent.intent.noteEdits?.pitch.map((e) => e.id)).toEqual([
      "visible",
      "hidden",
    ]);
    expect(parsed.metadata.exported.at).toBe(1234);
    expect(parsed.metadata.midiBytes).toEqual(
      Array.from(new Uint8Array(await expected.arrayBuffer())),
    );
    expect(parsed.metadata.frames).toEqual(captured.frames);
    const restored = await restoreRecordingPackage(parsed, "test.wav", "restore");
    expect(restored.noteEdits).toEqual(captured.record.noteEdits);
    expect(restored.play).toEqual({ instrument: "flute", octave: -1 });
    expect(restored.noteSource).toBeUndefined();
    expect(await decodeAudio(restored.audio)).toEqual(fixture.pcm);
    expect(
      new Uint8Array(await (await encodeTuneMidi(parsed.metadata.tune)).arrayBuffer()),
    ).toEqual(new Uint8Array(await expected.arrayBuffer()));
    expect(processRecording(restored, captured.frames).notes).toEqual(
      processRecording(captured.record, captured.frames).notes,
    );
  },
  15000,
);
it("starts fresh from the same validated package without restoring tune intent", async () => {
  const parsed = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot())).arrayBuffer(),
  );
  const fresh = await restoreRecordingPackage(parsed, "test.wav", "fresh");
  expect(fresh.noteEdits).toBeUndefined();
  expect(fresh.muted).toBeUndefined();
  expect(fresh.play).toBeUndefined();
  expect(fresh.imported?.metadata.schemaVersion).toBe(2);
  expect(fresh.imported?.tuneMode).toBe("fresh");
}, 15000);
it("captures defensively before hashing and refreshes state on re-export", async () => {
  const captured = snapshot();
  const old = captured.frames[0]!.t;
  fixture.frames[0]!.t = 999;
  expect(captured.frames[0]!.t).toBe(old);
  fixture.frames[0]!.t = old;
  const parsed = await readRecordingPackage(
    await (await encodeRecordingPackage(captured)).arrayBuffer(),
  );
  Object.assign(parsed.metadata, { extension: { future: true } });
  const restored = await restoreRecordingPackage(parsed, "test.wav", "restore");
  restored.name = "Revised";
  restored.id = "local-copy";
  const next = await readRecordingPackage(
    await (
      await encodeRecordingPackage(
        captureRecordingPackage(restored, fixture.pcm, fixture.frames, context, 5678),
      )
    ).arrayBuffer(),
  );
  expect(next.metadata.recording.name).toBe("Revised");
  expect(next.metadata).toHaveProperty("extension.future", true);
  if (next.metadata.schemaVersion !== 2) throw new Error("expected package");
  expect(next.metadata.exported.at).toBe(5678);
  expect(next.metadata.recording.sourceId).toBe("regression");
  expect(next.metadata.tune.name).toBe("Revised");
  expect(next.metadata.provenance).toEqual(parsed.metadata.provenance);
}, 15000);
it("accepts capture-only legacy files", async () => {
  const parsed = await readRecordingPackage(
    await encodeTaggedWav(fixture.record, fixture.pcm, context).arrayBuffer(),
  );
  expect(parsed.metadata.schemaVersion).toBe(1);
  expect((await restoreRecordingPackage(parsed, "old.wav", "restore")).noteEdits).toBeUndefined();
}, 15000);
it("rejects changed PCM even for fresh-start import", async () => {
  const bytes = await (await encodeRecordingPackage(snapshot())).arrayBuffer();
  const data = wavChunks(bytes).find((c) => c.id === "data")!;
  new DataView(bytes).setInt16(data.start, 123, true);
  await expect(readRecordingPackage(bytes)).rejects.toThrow(/audio|hash|match/i);
}, 15000);
it("rejects contradictory metadata, malformed frames, and invalid edit ranges", async () => {
  const parsed = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot())).arrayBuffer(),
  );
  for (const mutate of [
    (p: any) => {
      p.audio.sampleCount++;
    },
    (p: any) => {
      p.tune.bpm = 200;
    },
    (p: any) => {
      p.frames[0].rms = NaN;
    },
    (p: any) => {
      p.intent.intent.noteEdits.pitch[0].ranges[0].end = 999;
    },
    (p: any) => {
      p.schemaVersion = 3;
    },
  ]) {
    const value = structuredClone(parsed.metadata);
    mutate(value);
    expect(() => validateRecordingPackage(value, fixture.pcm.length, fixture.sampleRate)).toThrow();
  }
}, 15000);

it("keeps historical evidence readable after preset defaults change", async () => {
  const { PRESETS } = await import("./melody/knobs");
  const bytes = await (await encodeRecordingPackage(snapshot())).arrayBuffer();
  const preset = PRESETS.clean.knobs;
  const before = preset.keyPull;
  try {
    preset.keyPull = 0.23;
    const parsed = await readRecordingPackage(bytes);
    expect(parsed.metadata.schemaVersion).toBe(2);
    const fresh = await restoreRecordingPackage(parsed, "old.wav", "fresh");
    expect(fresh.noteEdits).toBeUndefined();
    if (parsed.metadata.schemaVersion !== 2) throw new Error("package");
    expect(parsed.metadata.tune.effectiveKnobs.keyPull).toBe(before);
  } finally {
    preset.keyPull = before;
  }
}, 15000);
it("rejects contradictory intent, source evidence, and invalid MIDI through the actual reader", async () => {
  const { encodeWav } = await import("./wav");
  const good = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot())).arrayBuffer(),
  );
  for (const mutate of [
    (p: any) => {
      p.intent.intent.play = { instrument: "flute", octave: -3 };
    },
    (p: any) => {
      p.evidence.stages.segments[0].source = { start: -1, end: 9999 };
      p.evidence.stages.segments[0].pitch = 999;
    },
    (p: any) => {
      p.midiBytes = [77, 84, 104, 100, ...Array(18).fill(0)];
    },
    (p: any) => {
      p.evidence.analysis.hop = 17;
    },
    (p: any) => {
      delete p.evidence.stages.knobs.keyPull;
    },
    (p: any) => {
      delete p.tune.effectiveKnobs.keyPull;
    },
    (p: any) => {
      p.evidence.stages.knobs.contextCorrection = 0.5;
    },
  ]) {
    const payload = structuredClone(good.metadata);
    mutate(payload);
    const wav = encodeWav(good.pcm, good.sampleRate, [
      { id: "dpsn", data: new TextEncoder().encode(JSON.stringify(payload)) },
    ]);
    await expect(readRecordingPackage(await wav.arrayBuffer())).rejects.toThrow(
      /damaged|unsupported/i,
    );
  }
}, 15000);
it("preserves compatible nested extensions while replacing known current state", async () => {
  const input = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot())).arrayBuffer(),
  );
  if (input.metadata.schemaVersion !== 2) throw new Error("package");
  Object.assign(input.metadata.audio, { futureField: "keep" });
  const r = await restoreRecordingPackage(input, "test.wav", "restore");
  delete r.noteEdits;
  const next = await readRecordingPackage(
    await (
      await encodeRecordingPackage(
        captureRecordingPackage(r, input.pcm, input.metadata.frames, context, 9),
      )
    ).arrayBuffer(),
  );
  expect(next.metadata).toHaveProperty("audio.futureField", "keep");
  if (next.metadata.schemaVersion !== 2) throw new Error("package");
  expect(next.metadata.intent.intent.noteEdits).toBeUndefined();
}, 15000);
