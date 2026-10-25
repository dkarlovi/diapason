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
    overrides: { steadiness: 0.2 },
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
  fireEvent.click(screen.getByText("Custom (from Gentle fix)"));
  fireEvent.click(screen.getByRole("button", { name: "Play Clean" }));
  expect(preview).toHaveBeenCalledWith({ preset: "clean", overrides: {} }, "preset-clean");
  expect(screen.getByText("Custom (from Gentle fix)")).toBeTruthy();
});
it("using a preset clears overrides and editing a knob shows Custom", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Custom (from Gentle fix)"));
  fireEvent.click(screen.getByRole("button", { name: "Use Clean" }));
  expect(screen.getByText("Clean")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Pull into key"), { target: { value: ".3" } });
  expect(screen.getByText("Custom (from Clean)")).toBeTruthy();
});
it("keeps automatic, suggested and all explicit key actions inside the key dropdown", () => {
  render(<Harness />);
  expect(screen.queryByText("Key alternatives")).toBeNull();
  expect(screen.queryByRole("button", { name: "Use key G major" })).toBeNull();
  fireEvent.click(screen.getByLabelText("Choose key"));
  expect(screen.getByRole("button", { name: "Use Auto key" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Use key / })).toHaveLength(24);
  expect(screen.getAllByRole("button", { name: /^Play key / })).toHaveLength(24);
  fireEvent.click(screen.getByRole("button", { name: "Use key G major" }));
  expect(screen.getByLabelText("Choose key").textContent).toContain("G major");
  expect(screen.queryByRole("button", { name: "Use key G major" })).toBeNull();
});
it("previews a key without applying it and restores focus after dismissal", () => {
  preview.mockClear();
  render(<Harness />);
  fireEvent.click(screen.getByLabelText("Choose key"));
  fireEvent.click(screen.getByRole("button", { name: "Play key G major" }));
  expect(preview).toHaveBeenCalledWith({ key: { tonic: 7, mode: "major" } }, "key-7-major");
  const key = screen.getByLabelText("Choose key");
  expect(key.textContent).toContain("Auto · E minor");
  expect(document.activeElement).toBe(key);
  fireEvent.click(key);
  fireEvent.keyDown(key, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Use Auto key" })).toBeNull();
  expect(document.activeElement).toBe(key);
});
it("keeps control explanations in tooltips without a separate help line", () => {
  render(<Harness />);
  const slider = screen.getByLabelText("Steadiness");
  expect(slider.title).toContain("Keep held notes whole");
  expect(slider.closest(".ctl")?.querySelector("small")).toBeNull();
});
it("reveals presets and tuning groups only when requested", () => {
  render(<Harness />);
  expect(screen.queryByRole("button", { name: "Use Clean" })).toBeNull();
  expect(screen.queryByLabelText("Minimum note length")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Detection" }));
  expect(screen.getByLabelText("Minimum note length")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rhythm" }));
  expect(screen.getByLabelText("Timing grid")).toBeTruthy();
  fireEvent.click(screen.getByText("Custom (from Gentle fix)"));
  for (const preset of Object.values(PRESETS))
    expect(screen.getByRole("button", { name: `Use ${preset.label}` })).toBeTruthy();
});
