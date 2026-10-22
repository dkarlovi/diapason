import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Capture } from "./Capture";

const setGain = vi.fn();
vi.mock("../audio", () => ({
  listInputDevices: async () => [{ deviceId: "mic-1", label: "Studio mic", kind: "audioinput" }],
  openMic: async () => ({
    sampleRate: 48000,
    context: { resume: async () => undefined },
    tap: {},
    setGain,
    readFrame: () => new Float32Array([0.1]),
    getSettings: () => ({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }),
    close: () => undefined,
  }),
}));
vi.mock("../pitch", () => ({
  createPitchDetector: () => () => ({ freq: 440, clarity: 0.99, rms: 0.004 }),
}));
vi.mock("../trace", async (importOriginal) => {
  const original = await importOriginal<typeof import("../trace")>();
  return { ...original, drawTrace: () => undefined };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setGain.mockClear();
});

it("shows microphone state and enables recording after room calibration", async () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Studio mic")).toBeTruthy();
  expect(screen.getByText(/echoCancellation: OFF/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "2" } });
  expect(setGain).toHaveBeenCalledWith(2);
  expect(screen.getByText("2.0×")).toBeTruthy();

  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => {
    frame?.(0);
    frame?.(0);
  });
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByText(/floor 0.0040/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "● Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("discards a room calibration when the microphone changes", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Studio mic")).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Microphone"), { target: { value: "mic-1" } });
    await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByText("not measured yet")).toBeTruthy();
  expect((screen.getByRole("button", { name: "● Record" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
