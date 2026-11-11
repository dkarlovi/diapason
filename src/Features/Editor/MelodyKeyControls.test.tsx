import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { interpretSegments } from "../../Melody/Interpret";
import { PRESETS } from "../../Melody/Knobs";
import { MelodyKeyControls } from "./MelodyKeyControls";

afterEach(cleanup);

it.each([3, 4] as const)("labels the effective key for interpretation %s", (version) => {
  const key = { tonic: 4, mode: "minor" as const };
  const interpretation = interpretSegments(
    [{ start: 0, duration: 1, pitch: 76, source: { start: 0, end: 1 } }],
    {
      version,
      knobs: PRESETS["auto-major"].knobs,
      key,
      timing: { bpm: 120, beatsPerBar: 4 },
      range: { minMidi: 48, maxMidi: 100 },
    },
  );
  render(
    <MelodyKeyControls
      melody={{ preset: "auto-major", overrides: {}, key }}
      interpretation={interpretation}
      disabled={false}
      previewId={null}
      changeKey={() => {}}
      previewMelody={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: "Choose key" }).textContent).toContain(
    version === 3 ? "E major" : "E minor",
  );
});
