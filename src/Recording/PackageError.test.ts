// @vitest-environment node
import { expect, it } from "vitest";
import { historicalControls, PRESETS } from "../Melody/Knobs";
import { investigationInput } from "../../tests/support/investigation";
import { readRecordingPackage } from "./RecordingPackage";
import { validateRecordingPackage } from "./RecordingPackage.validation";
import { encodeWav } from "../Encoding/Wav";
it("resolves missing historical controls without changing saved observations", () => {
  const { contextCorrection: _context, ...old } = PRESETS.clean.knobs;
  const resolved = historicalControls(old, 1);
  expect(resolved.values.contextCorrection).toBe(0);
  expect(resolved.defaults).toEqual([
    { key: "contextCorrection", value: 0, reason: "Interpretation 1 predates Context correction." },
  ]);
  expect(old).not.toHaveProperty("contextCorrection");
  expect(historicalControls({ ...old, contextCorrection: 0.35 }, 2).values.contextCorrection).toBe(
    0.35,
  );
  expect(historicalControls({ ...old, contextCorrection: 0 }, 2).defaults).toEqual([]);
  expect(() => historicalControls(old, 2)).toThrowError(
    expect.objectContaining({ code: "historical-default", path: "knobs.contextCorrection" }),
  );
});
it("identifies the exact missing control and never treats malformed values as defaults", async () => {
  const { input } = await investigationInput();
  const p = structuredClone(input.metadata);
  if (p.schemaVersion !== 2) throw new Error("fixture");
  Reflect.deleteProperty(p.evidence.stages.knobs, "keyPull");
  expect(() => validateRecordingPackage(p, input.pcm.length, input.sampleRate)).toThrowError(
    expect.objectContaining({
      path: "evidence.stages.knobs.keyPull",
      context: expect.objectContaining({ schemaVersion: 2 }),
      trusted: false,
    }),
  );
  const bad = { ...PRESETS.clean.knobs, contextCorrection: Number.NaN };
  expect(() => historicalControls(bad, 2)).toThrowError(
    expect.objectContaining({ code: "malformed", path: "knobs.contextCorrection" }),
  );
});
it("names PCM hash failures separately from unsupported interpretation versions", async () => {
  const { input } = await investigationInput();
  const p = structuredClone(input.metadata);
  if (p.schemaVersion !== 2) throw new Error("fixture");
  p.audio.sha256 = "0".repeat(64);
  const bytes = await encodeWav(input.pcm, input.sampleRate, [
    { id: "dpsn", data: new TextEncoder().encode(JSON.stringify(p)) },
  ]).arrayBuffer();
  await expect(readRecordingPackage(bytes)).rejects.toMatchObject({
    code: "malformed",
    path: "audio.sha256",
    check: "pcm.identity",
    trusted: false,
  });
  Reflect.set(p.tune.noteSource, "interpretationVersion", 99);
  expect(() => validateRecordingPackage(p, input.pcm.length, input.sampleRate)).toThrowError(
    expect.objectContaining({ code: "unsupported", path: "tune.noteSource.interpretationVersion" }),
  );
});
it("reports missing structure and container failures before attempting analysis", async () => {
  const { input, bytes } = await investigationInput();
  const missing = structuredClone(input.metadata);
  Reflect.deleteProperty(missing, "evidence");
  expect(() => validateRecordingPackage(missing, input.pcm.length, input.sampleRate)).toThrowError(
    expect.objectContaining({ path: "evidence" }),
  );
  await expect(readRecordingPackage(bytes.slice(0, 60))).rejects.toMatchObject({
    code: "malformed",
    path: "wav",
    trusted: false,
  });
});

it("names a missing stage array and duplicate metadata chunks", async () => {
  const { input } = await investigationInput();
  const p = structuredClone(input.metadata);
  if (p.schemaVersion !== 2) throw new Error("fixture");
  Reflect.deleteProperty(p.evidence.stages, "items");
  expect(() => validateRecordingPackage(p, input.pcm.length, input.sampleRate)).toThrowError(
    expect.objectContaining({ path: "evidence.stages.items" }),
  );
  const data = new TextEncoder().encode(JSON.stringify(input.metadata));
  const duplicate = await encodeWav(input.pcm, input.sampleRate, [
    { id: "dpsn", data },
    { id: "dpsn", data },
  ]).arrayBuffer();
  await expect(readRecordingPackage(duplicate)).rejects.toMatchObject({
    path: "wav.chunks",
    check: "wav.unique-chunks",
  });
});

it("normalizes errors whose diagnostic trust marker is invalid instead of forwarding their context", async () => {
  const { PackageError, packageError } = await import("./PackageError");
  const error = new PackageError("malformed", "audio.sha256", "pcm.identity", "Invalid data", {
    schemaVersion: 2,
  });
  Reflect.set(error, "trusted", true);
  expect(packageError(error, "wav", "wav.container")).toMatchObject({
    path: "wav",
    check: "wav.container",
    trusted: false,
    context: {},
  });
});
