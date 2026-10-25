import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveBeat } from "./LiveBeat";
import type { TransportState } from "../metronome";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(["preview", "count-in", "recording"] as const)(
  "flashes the same odd beat twice below 120 BPM during %s",
  (phase) => {
    vi.useFakeTimers();
    const clock = { currentTime: 0 };
    const transport: TransportState = {
      bpm: 60,
      beatsPerBar: 5,
      downbeatTime: phase === "count-in" ? 5 : 0,
      phase,
      running: true,
    };
    const { container, rerender } = render(
      <LiveBeat bpm={60} beatsPerBar={5} transport={transport} clock={clock} />,
    );
    const activeAt = (at: number) => {
      clock.currentTime = at;
      act(() => vi.advanceTimersByTime(25));
      return container.querySelector('[data-active="true"]')?.textContent ?? null;
    };
    expect(activeAt(0.55)).toBe("1");
    expect(activeAt(1.55)).toBe("2");
    expect(activeAt(2.05)).toBe("3");
    expect(activeAt(2.35)).toBeNull();
    expect(activeAt(2.55)).toBe("3");
    expect(activeAt(2.85)).toBeNull();
    expect(activeAt(3.05)).toBe("4");
    expect(activeAt(4.05)).toBe("5");
    expect(activeAt(4.35)).toBeNull();
    expect(activeAt(4.55)).toBe("5");
    expect(activeAt(5.05)).toBe("1");
    expect(container.querySelectorAll(".beat-pips span")).toHaveLength(5);
    rerender(
      <LiveBeat
        bpm={120}
        beatsPerBar={5}
        transport={{ ...transport, bpm: 120, downbeatTime: 0 }}
        clock={clock}
      />,
    );
    expect(activeAt(1.18)).toBe("3");
    expect(activeAt(1.43)).toBe("3");
  },
);

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
