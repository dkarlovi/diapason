import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { MelodyPanel } from "./MelodyPanel";
import type { MelodySetting } from "../melody/settings";
import { PRESETS } from "../melody/knobs";
import type { Interpretation } from "../melody/interpret";
afterEach(cleanup);
const preview = vi.fn();
function Harness() {
  const [melody, set] = useState<MelodySetting>({
    preset: "gentle",
    overrides: { stickiness: 0.2 },
    key: "auto",
  });
  const change = (patch: Partial<MelodySetting>) => set((current) => ({ ...current, ...patch }));
  const interpretation = {
    key: {
      chosen: { tonic: 4, mode: "minor" },
      auto: true,
      ranked: [
        { key: { tonic: 4, mode: "minor" }, score: 0.8 },
        { key: { tonic: 7, mode: "major" }, score: 0.6 },
        { key: { tonic: 0, mode: "major" }, score: 0.4 },
      ],
    },
  } as Interpretation;
  return (
    <MelodyPanel
      melody={melody}
      interpretation={interpretation}
      disabled={false}
      previewId={null}
      applyPreset={(preset) => change({ preset, overrides: {} })}
      changeKnob={(key, value) => change({ overrides: { ...melody.overrides, [key]: value } })}
      resetKnob={() => change({ overrides: {} })}
      changeKey={(key) => change({ key })}
      previewMelody={preview}
    />
  );
}
it("previewing a preset leaves the current selection unchanged", () => {
  preview.mockClear();
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Play Clean" }));
  expect(preview).toHaveBeenCalledWith({ preset: "clean", overrides: {} }, "preset-clean");
  expect(screen.getByRole("heading", { name: "Custom (from Gentle fix)" })).toBeTruthy();
});
it("using a preset clears overrides and editing a knob shows Custom", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Use Clean" }));
  expect(screen.getByRole("heading", { name: "Clean" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Pull into key"), { target: { value: ".3" } });
  expect(screen.getByRole("heading", { name: "Custom (from Clean)" })).toBeTruthy();
});
it("offers Auto, previewable alternatives and every key behind I know my key", () => {
  render(<Harness />);
  expect((screen.getByLabelText("Key") as HTMLSelectElement).value).toBe("auto");
  expect(screen.getAllByRole("button", { name: /^Play key / })).toHaveLength(3);
  fireEvent.click(screen.getByText("I know my key"));
  expect(screen.getByLabelText("Choose any key").querySelectorAll("option")).toHaveLength(24);
});
it("basic knobs are visible and other controls are inside More", () => {
  render(<Harness />);
  expect(screen.getByLabelText("Stickiness").closest("details")).toBeNull();
  expect(screen.getByLabelText("Pull into key").closest("details")).toBeNull();
  expect(
    screen.getByLabelText("Minimum note length").closest("details")?.querySelector("summary")
      ?.textContent,
  ).toBe("More");
  for (const preset of Object.values(PRESETS))
    expect(screen.getByRole("button", { name: `Use ${preset.label}` })).toBeTruthy();
});
