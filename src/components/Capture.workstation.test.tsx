import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  calibratedCapture,
  click,
  fixture,
  renderCapture,
  resetFixture,
} from "../../tests/capture-fixture";

beforeEach(resetFixture);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows six horizontal setup steps without enabling future steps or an initial Back action", () => {
  renderCapture();
  const steps = screen.getByRole("navigation", { name: "Recording steps" });
  expect(steps.querySelectorAll("button")).toHaveLength(6);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: /Step 6: Record/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(steps.textContent).not.toContain("NaN");
});

it("keeps the live canvas and record toggle mounted while the wizard folds and restores", async () => {
  await calibratedCapture();
  fixture.pcm = new Float32Array(100);
  const canvas = screen.getByRole("img");
  const toggle = screen.getByRole("button", { name: "Record" });
  await click("Record");
  expect(screen.getByRole("button", { name: "Stop & save" })).toBe(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(screen.getByRole("img")).toBe(canvas);
  act(() => fixture.metro?.onBeat?.(-4));
  expect(screen.getByRole("group", { name: /Metronome/ }).textContent).toContain("90");
  await click("Stop & save");
  expect(screen.getByRole("button", { name: "Record" })).toBe(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("img")).toBe(canvas);
  expect(screen.getByText(/Too short/)).toBeTruthy();
});
