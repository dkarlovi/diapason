// @vitest-environment node
import { expect, it } from "vitest";
import moon from "../../tests/fixtures/whistle-moon/interpretation.json";
import { loadFixture } from "../../tests/support/fixtures";
import { noteRecording } from "../../tests/support/note-recording";
import { processRecording } from "../Recording/Processing";
import type { Recording } from "../Recording/Recording.type";
import { PRESETS, resolveKnobs, type PresetId } from "./Knobs";

const intro = loadFixture("whistle-intro");
const detection = resolveKnobs("as-played", {});
const fixtures: { name: string; record: Recording; frames: typeof intro.frames }[] = [
  { name: "whistle-intro", record: intro.record, frames: intro.frames },
  {
    name: "whistle-moon",
    frames: [],
    record: {
      ...noteRecording(),
      bpm: moon.timing.bpm,
      beatsPerBar: moon.timing.beatsPerBar,
      durationSec: 17,
      noteSource: {
        version: 1,
        interpretationVersion: 1,
        range: moon.range,
        segments: moon.segments,
        frozenDetection: {
          steadiness: detection.steadiness,
          minNoteMs: detection.minNoteMs,
          silenceGapMs: detection.silenceGapMs,
          levelGate: detection.levelGate,
        },
      },
    },
  },
];
const offered = Object.values(PRESETS)
  .filter((preset) => preset.kind !== "retired")
  .map((preset) => preset.id);

function outputs(preset: PresetId): string[] {
  return fixtures.map(({ record, frames }) =>
    JSON.stringify(
      processRecording({ ...record, melody: { preset, overrides: {}, key: "auto" } }, frames).notes,
    ),
  );
}

it("every offered preset sounds different from every other on some fixture", () => {
  const sounds = new Map(offered.map((preset) => [preset, outputs(preset)]));
  const identical = offered.flatMap((a, i) =>
    offered
      .slice(i + 1)
      .filter((b) => sounds.get(a)!.every((output, f) => output === sounds.get(b)![f]))
      .map((b) => `${a} = ${b}`),
  );
  expect(identical).toEqual([]);
}, 60_000);
