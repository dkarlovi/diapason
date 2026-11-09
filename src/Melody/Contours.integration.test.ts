// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { sha256 } from "../Encoding/Sha256";
import { wavChunks } from "../Encoding/WavReader";
import { loadFixture } from "../../tests/support/fixtures";
import moon from "../../tests/fixtures/whistle-moon/interpretation.json";
import manifest from "../../tests/fixtures/whistle-moon/manifest.json";
import cases from "../../tests/fixtures/contours/cases.json";
import { contourFrames } from "../../tests/support/contours";
import type { ContourCase } from "../../tests/support/contours.type";
import { segmentMelody } from "./Decode";
import { PRESETS } from "./Knobs";

const moonTake = loadFixture("whistle-moon");

function hasContourPitch(part: (typeof cases)[number]["parts"][number]): boolean {
  const fields = new Map(Object.entries(part));
  const numeric = (name: string) => typeof fields.get(name) === "number";
  switch (part.kind) {
    case "silence":
      return true;
    case "hold":
      return numeric("midi");
    case "linear":
      return numeric("from") && numeric("to");
    case "vibrato":
      return ["midi", "amplitude", "hz"].every(numeric);
    default:
      return false;
  }
}

function isContourCase(
  contour: (typeof cases)[number],
): contour is (typeof cases)[number] & ContourCase {
  return (
    contour.parts.every(hasContourPitch) &&
    ["synthetic", "unreviewed"].includes(contour.intent.review) &&
    ["exact", "contains"].includes(contour.intent.boundaries) &&
    contour.observations.every((observation) =>
      ["matches", "differs", "unreviewed"].includes(observation.intent),
    )
  );
}

if (!cases.every(isContourCase)) throw new Error("Invalid contour corpus discriminant.");
const contours: ContourCase[] = cases;

const corpus = contours.flatMap((contour) =>
  contour.observations.map((observation) => ({
    id: contour.id,
    contour,
    observation,
    steadiness: observation.steadiness,
  })),
);

it.each([
  ["connecting-slide-up", "connecting-slide-down", 75.5],
  ["held-drift", "held-drift-down", 76],
  ["quick-chromatic-steps", "quick-chromatic-steps-down", 76],
  ["sustained-chromatic-steps", "sustained-chromatic-steps-down", 76],
  ["continuous-articulated-run", "continuous-articulated-run-down", 76],
  ["attack-overshoot", "attack-overshoot-up", 76],
  ["release-drift", "release-drift-down", 76],
  ["intentional-continuous-glide", "intentional-continuous-glide-down", 75.5],
] as const)("evaluates both directions of %s using %s", (id, mirrorId, center) => {
  const original = contours.find((contour) => contour.id === id)!;
  const mirror = contours.find((contour) => contour.id === mirrorId);
  expect(mirror).toBeDefined();
  const frames = contourFrames(original.parts);
  const mirrored = contourFrames(mirror!.parts);
  expect(mirrored).toHaveLength(frames.length);
  expect(mirror!.observations.map((observation) => observation.steadiness)).toEqual(
    original.observations.map((observation) => observation.steadiness),
  );
  for (const [i, frame] of frames.entries()) {
    expect(mirrored[i]!.t).toBe(frame.t);
    expect(mirrored[i]!.rms).toBe(frame.rms);
    expect(mirrored[i]!.clarity).toBe(frame.clarity);
    expect(138 + 12 * Math.log2((frame.freq! * mirrored[i]!.freq!) / 440 ** 2)).toBeCloseTo(
      2 * center,
      9,
    );
  }
});

it("preserves the full Moon PCM identified by the reviewed pitch corrections", async () => {
  const take = moonTake;
  const bytes = readFileSync(
    new URL("../../tests/fixtures/whistle-moon/original.wav", import.meta.url),
  );
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const data = wavChunks(buffer).find((chunk) => chunk.id === "data")!;
  expect(await sha256(buffer)).toBe(manifest.files["original.wav"]);
  expect(await sha256(buffer.slice(data.start, data.start + data.length))).toBe(manifest.pcmSha256);
  expect(manifest.pcmSha256).toBe(moon.pcmSha256);
  expect(take.sampleRate).toBe(manifest.sampleRate);
  expect(take.pcm).toHaveLength(manifest.sampleCount);
  expect(take.record.bpm).toBe(manifest.bpm);
});

it("characterizes full-context Moon segmentation independently of contextual correction", () => {
  const take = moonTake;
  const segments = segmentMelody(take.frames, {
    ...PRESETS["as-played"].knobs,
    steadiness: 1,
    minNoteMs: 80,
    silenceGapMs: 90,
    levelGate: 0.003,
  });
  expect(segments).toHaveLength(moon.segments.length);
  for (const [i, expected] of moon.segments.entries()) {
    const actual = segments[i]!;
    expect(actual.source.start).toBeCloseTo(expected.source.start, 9);
    expect(actual.source.end).toBeCloseTo(expected.source.end, 9);
    expect(actual.pitch).toBeCloseTo(expected.pitch, 6);
  }
});

it.each(corpus)(
  "characterizes $id at Steadiness $steadiness (baseline, not musical approval)",
  ({ contour, observation, steadiness }) => {
    const frames = contourFrames(contour.parts);
    const segments = segmentMelody(frames, { ...PRESETS["as-played"].knobs, steadiness });
    expect(segments).toHaveLength(observation.segments.length);
    for (const [i, expected] of observation.segments.entries()) {
      const actual = segments[i]!;
      expect(actual.source.start).toBeCloseTo((expected.startFrame * 512) / 48000, 9);
      expect(actual.source.end).toBeCloseTo((expected.endFrame * 512) / 48000, 9);
      expect(actual.pitch).toBeCloseTo(expected.pitch, 6);
      expect(actual.start).toBe(actual.source.start);
      expect(actual.duration).toBeCloseTo(actual.source.end - actual.source.start, 9);
      if (i) expect(segments[i - 1]!.source.end).toBeLessThanOrEqual(actual.source.start);
    }
    for (const frame of frames)
      if (frame.freq !== null)
        expect(
          segments.filter(
            (segment) => segment.source.start <= frame.t && frame.t < segment.source.end,
          ),
        ).toHaveLength(1);
  },
);

it.each(corpus.filter(({ observation }) => observation.intent === "matches"))(
  "preserves synthetic intent for $id at Steadiness $steadiness",
  ({ contour, steadiness }) => {
    const segments = segmentMelody(contourFrames(contour.parts), {
      ...PRESETS["as-played"].knobs,
      steadiness,
    });
    const intended = contour.intent.notes!;
    expect(contour.intent.review).toBe("synthetic");
    expect(segments).toHaveLength(intended.length);
    for (const [i, expected] of intended.entries()) {
      const actual = segments[i]!;
      expect(Math.abs(actual.pitch - expected.pitch)).toBeLessThanOrEqual(0.2);
      const start = (expected.startFrame * 512) / 48000;
      const end = (expected.endFrame * 512) / 48000;
      if (contour.intent.boundaries === "exact") {
        expect(actual.source.start).toBeCloseTo(start, 9);
        expect(actual.source.end).toBeCloseTo(end, 9);
      } else {
        expect(actual.source.start).toBeLessThanOrEqual(start);
        expect(actual.source.end).toBeGreaterThanOrEqual(end);
      }
    }
  },
);
