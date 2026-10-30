// @vitest-environment node
import { expect, it } from "vitest";
import { compareValues } from "../Diagnostics/Diagnostics.validation";
import { investigationContext } from "../../tests/support/investigation";
import { verifyPackage } from "./Verification";
it("reports tolerated numeric drift and scans past the first difference", () => {
  const small = compareValues({ a: 0, b: 10 }, { a: 3.552713678800501e-15, b: 10 }, "replay");
  expect(small.firstDifference).toBeNull();
  expect(small.maxNumericDelta).toEqual({ path: "replay.a", absolute: 3.552713678800501e-15 });
  const large = compareValues({ a: 0, b: 0 }, { a: 2e-9, b: 0.25 }, "replay");
  expect(large.firstDifference).toBe("replay.a");
  expect(large.maxNumericDelta).toEqual({ path: "replay.b", absolute: 0.25 });
});
it("verifies independently checked source, replay, MIDI and import evidence", async () => {
  const { context } = await investigationContext();
  const before = JSON.stringify(context.input.metadata);
  const result = await verifyPackage(context, { portable: false });
  expect(result.overall, JSON.stringify(result.data.checks)).toBe("pass");
  const statuses = Object.fromEntries(result.data.checks.map((c) => [c.id, c.status]));
  expect(statuses).toMatchObject({
    "package.integrity": "pass",
    "replay.edited": "pass",
    "midi.bytes": "pass",
    "musical.events": "pass",
    "import.restore": "pass",
    "import.fresh": "pass",
    "pcm.roundtrip": "pass",
  });
  expect(JSON.stringify(context.input.metadata)).toBe(before);
});
it("distinguishes changed acoustic evidence from intact PCM and differing builds", async () => {
  const { context } = await investigationContext();
  const p = context.input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  p.exported.context.build.revision = "older";
  const different = await verifyPackage(context, { portable: false });
  expect(different.overall).toBe("pass");
  p.frames[0]!.rms += 0.01;
  const result = await verifyPackage(context, { portable: false });
  expect(result.overall).toBe("mismatch");
  expect(result.data.checks.find((c) => c.id === "package.integrity")?.status).toBe("pass");
  expect(
    result.data.checks.find((c) => c.id === "replay.edited")?.difference?.firstDifference,
  ).toContain("frames");
});
it("labels schema-1 missing baselines as incomplete instead of inventing a replay", async () => {
  const { context } = await investigationContext();
  const p = context.input.metadata;
  context.input.metadata = {
    app: "diapason",
    kind: "recording",
    schemaVersion: 1,
    recording: p.recording,
    provenance: p.provenance,
  };
  const result = await verifyPackage(context, { portable: false });
  expect(result.overall).toBe("incomplete");
  expect(result.data.checks.find((c) => c.id === "replay.edited")?.status).toBe("skipped");
});

it("does not call portable millisecond projection damage when it crosses a MIDI tick boundary", async () => {
  const { investigationInput } = await import("../../tests/support/investigation");
  const { logicalPlaybackEvents } = await import("./Events");
  const { readTuneMidiMusic } = await import("../Midi/TuneMidiReader");
  const { context } = await investigationContext();
  const { input } = await investigationInput("tick boundary", {
    bpm: 111,
    melody: { preset: "as-played", overrides: {}, key: "auto" },
  });
  context.input = input;
  const p = input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  const source = logicalPlaybackEvents(p.evidence.notes, p.tune).events;
  const portable = readTuneMidiMusic(Uint8Array.from(p.midiBytes)).events;
  expect(source).not.toEqual(portable);
  const result = await verifyPackage(context, { portable: false });
  expect(result.overall).toBe("pass");
});

it("reuses lossless acoustic evidence while rechecking changed saved observations", async () => {
  const { context } = await investigationContext();

  const cached = Object.assign(context, {
    stageKey: (stage: string, dependencies: unknown) => JSON.stringify([stage, dependencies]),
  });
  const cold = await verifyPackage(cached, { portable: false });
  const warm = await verifyPackage(cached, { portable: false });
  expect(cold.data.provenance[0]?.disposition).toBe("recomputed");
  expect(warm.data.provenance[0]?.disposition).toBe("reused");
  expect(warm.data.checks).toEqual(cold.data.checks);
  expect(warm.data.provenance.find((p) => p.stage === "edited")?.disposition).toBe("reused");
  const p = context.input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  p.frames[0]!.rms += 0.01;
  expect((await verifyPackage(cached, { portable: false })).overall).toBe("mismatch");
  await context.stages.write(warm.data.provenance[0]!.key, {
    schemaVersion: 1,
    packed: ["invalid", null, 1, 0],
  });
  const repaired = await verifyPackage(cached, { portable: false });
  expect(repaired.data.provenance[0]?.disposition).toBe("recomputed");
  expect(repaired.overall).toBe("mismatch");
  context.execution.codeRuntimeKey = null;
  expect((await verifyPackage(cached, { portable: false })).data.provenance[0]?.disposition).toBe(
    "recomputed",
  );
});
