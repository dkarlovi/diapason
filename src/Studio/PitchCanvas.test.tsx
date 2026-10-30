import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { PitchCanvas } from "./PitchCanvas";

afterEach(cleanup);

it("exposes the native canvas ref, accessible name, and fallback content", () => {
  const ref = createRef<HTMLCanvasElement>();
  render(
    <PitchCanvas ref={ref} aria-label="Original pitch trace" title="Original recorded pitch">
      Original microphone performance
    </PitchCanvas>,
  );
  const canvas = screen.getByRole("img", { name: "Original pitch trace" });
  expect(ref.current).toBe(canvas);
  expect(canvas.tagName).toBe("CANVAS");
  expect(canvas.textContent).toBe("Original microphone performance");
  expect(canvas.getAttribute("title")).toBe("Original recorded pitch");
});

function InteractiveRoll() {
  const [note, setNote] = useState("A4");
  return (
    <>
      <PitchCanvas
        aria-label="MIDI piano roll"
        aria-describedby="instructions"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") setNote("B4");
        }}
        onClick={() => setNote("C5")}
      />
      <p id="instructions">Arrow keys select notes</p>
      <output aria-label="Selected note">{note}</output>
    </>
  );
}

it("allows the owning screen to handle keyboard and pointer note selection", () => {
  render(<InteractiveRoll />);
  const canvas = screen.getByRole("img", { name: "MIDI piano roll" });
  canvas.focus();
  expect(document.activeElement).toBe(canvas);
  expect(canvas.getAttribute("aria-describedby")).toBe("instructions");
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  expect(screen.getByLabelText("Selected note").textContent).toBe("B4");
  fireEvent.click(canvas);
  expect(screen.getByLabelText("Selected note").textContent).toBe("C5");
});
