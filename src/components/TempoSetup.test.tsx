import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TempoSetup } from "./TempoSetup";
import { useTempo } from "../hooks/useTempo";
import { useState } from "react";
afterEach(cleanup);
it("accepts manual tempo without a detection test and keeps keyboard taps out of numeric fields", () => {
  const confirmed = vi.fn();
  function Harness() {
    const [bpm, setBpm] = useState(90);
    const [meter, setMeter] = useState(4);
    const tempo = useTempo({
      bpm,
      beatsPerBar: meter,
      floor: 0,
      currentMic: () => null,
      onChange: (value, beats) => {
        setBpm(value);
        setMeter(beats);
      },
      onConfirm: confirmed,
    });
    return <TempoSetup tempo={tempo} bpm={bpm} beatsPerBar={meter} />;
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "120" } });
  fireEvent.keyDown(screen.getByLabelText("Tempo (BPM)"), { code: "Space", key: " " });
  fireEvent.click(screen.getByRole("button", { name: "Confirm tempo" }));
  expect(confirmed).toHaveBeenCalledOnce();
});
