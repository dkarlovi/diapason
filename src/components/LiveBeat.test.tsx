import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveBeat } from "./LiveBeat";
import type { TransportState } from "../metronome";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("follows the audio clock through count-in, suspended time, and the recorded downbeat", () => {
  vi.useFakeTimers();
  const clock = { currentTime: 9.25 };
  const transport: TransportState = {
    bpm: 120,
    beatsPerBar: 4,
    downbeatTime: 10,
    phase: "count-in",
    running: true,
  };
  const { container, rerender } = render(
    <LiveBeat bpm={120} beatsPerBar={4} transport={transport} clock={clock} />,
  );
  expect(container.querySelector('[data-active="true"]')?.textContent).toBe("3");
  expect(container.textContent).toContain("Count-in");
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector('[data-active="true"]')?.textContent).toBe("3");
  clock.currentTime = 10.5;
  act(() => vi.advanceTimersByTime(25));
  rerender(
    <LiveBeat
      bpm={120}
      beatsPerBar={4}
      transport={{ ...transport, phase: "recording" }}
      clock={clock}
    />,
  );
  expect(container.querySelector('[data-active="true"]')?.textContent).toBe("2");
  expect(container.textContent).toContain("0:00");
  rerender(<LiveBeat bpm={120} beatsPerBar={4} transport={null} clock={clock} />);
  expect(container.querySelector('[data-active="true"]')).toBeNull();
});
