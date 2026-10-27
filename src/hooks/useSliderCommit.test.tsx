import { flushSync } from "react-dom";
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useSliderCommit } from "./useSliderCommit";
afterEach(cleanup);
function Harness({ syncBegin = false }: { syncBegin?: boolean } = {}) {
  const [value, setValue] = useState(3),
    [active, setActive] = useState(false),
    [saved, setSaved] = useState<number[]>([]);
  const baseline = useRef(3),
    current = useRef(3);
  current.current = value;
  const handlers = useSliderCommit({
    active,
    begin() {
      baseline.current = current.current;
      if (syncBegin) flushSync(() => setActive(true));
      else setActive(true);
    },
    update(v) {
      current.current = v;
      setValue(v);
    },
    commit() {
      setActive(false);
      if (current.current !== baseline.current) setSaved((s) => [...s, current.current]);
    },
    cancel() {
      current.current = baseline.current;
      setValue(baseline.current);
      setActive(false);
    },
  });
  return (
    <>
      <input aria-label="Test slider" type="range" min="0" max="10" value={value} {...handlers} />
      <output aria-label="Saved">{saved.join(",")}</output>
      <button
        onClick={() => {
          setValue(baseline.current);
          setActive(false);
        }}
      >
        Cancel externally
      </button>
    </>
  );
}
it("commits only the final pointer value and ignores capture loss after release", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.pointerDown(input, { isPrimary: true, button: 0, pointerId: 1 });
  for (const value of [4, 5, 6, 7]) fireEvent.change(input, { target: { value } });
  expect(screen.getByLabelText("Saved").textContent).toBe("");
  fireEvent.pointerUp(input, { pointerId: 1 });
  fireEvent.lostPointerCapture(input);
  expect(screen.getByLabelText("Saved").textContent).toBe("7");
});
it("cancels Escape and prevents late input from saving an externally cancelled drag", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.pointerDown(input, { isPrimary: true, button: 0, pointerId: 1 });
  fireEvent.change(input, { target: { value: 7 } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  fireEvent.pointerUp(input, { pointerId: 1 });
  expect((input as HTMLInputElement).value).toBe("3");
  expect(screen.getByLabelText("Saved").textContent).toBe("");
  fireEvent.pointerDown(input, { isPrimary: true, button: 0, pointerId: 1 });
  fireEvent.change(input, { target: { value: 7 } });
  fireEvent.click(screen.getByText("Cancel externally"));
  fireEvent.change(input, { target: { value: 8 } });
  fireEvent.pointerUp(input, { pointerId: 1 });
  expect(screen.getByLabelText("Saved").textContent).toBe("");
});
it("groups held keyboard changes, finalizes on blur and supports assistive input", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.keyDown(input, { key: "ArrowRight" });
  fireEvent.change(input, { target: { value: 4 } });
  fireEvent.keyDown(input, { key: "ArrowRight", repeat: true });
  fireEvent.change(input, { target: { value: 5 } });
  expect(screen.getByLabelText("Saved").textContent).toBe("");
  fireEvent.keyUp(input, { key: "ArrowRight" });
  fireEvent.keyDown(input, { key: "ArrowRight" });
  fireEvent.change(input, { target: { value: 6 } });
  fireEvent.blur(input);
  fireEvent.change(input, { target: { value: 7 } });
  expect(screen.getByLabelText("Saved").textContent).toBe("5,6,7");
});
it("cancels pointer cancellation and a no-op gesture", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.pointerDown(input, { isPrimary: true, button: 0, pointerId: 1 });
  fireEvent.change(input, { target: { value: 7 } });
  fireEvent.pointerCancel(input, { pointerId: 1 });
  fireEvent.pointerUp(input, { pointerId: 1 });
  fireEvent.pointerDown(input, { isPrimary: true, button: 0, pointerId: 1 });
  fireEvent.change(input, { target: { value: 4 } });
  fireEvent.change(input, { target: { value: 3 } });
  fireEvent.pointerUp(input, { pointerId: 1 });
  expect(screen.getByLabelText("Saved").textContent).toBe("");
});
it("keeps a cancelled gesture blocked until its original pointer is released", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.pointerDown(input, { isPrimary: true, pointerId: 1, button: 0 });
  fireEvent.change(input, { target: { value: 7 } });
  fireEvent.pointerDown(input, { isPrimary: false, pointerId: 2, button: 0 });
  fireEvent.pointerUp(input, { pointerId: 2 });
  fireEvent.change(input, { target: { value: 8 } });
  expect(screen.getByLabelText("Saved").textContent).toBe("");
  fireEvent.pointerUp(input, { pointerId: 1 });
  fireEvent.change(input, { target: { value: 6 } });
  expect(screen.getByLabelText("Saved").textContent).toBe("6");
});
it("allows a new pointer after cancellation without waiting for a pointerup that never comes", () => {
  render(<Harness />);
  const input = screen.getByLabelText("Test slider");
  fireEvent.pointerDown(input, { isPrimary: true, pointerId: 1, button: 0 });
  fireEvent.change(input, { target: { value: 7 } });
  fireEvent.pointerCancel(input, { pointerId: 1 });
  fireEvent.pointerDown(input, { isPrimary: true, pointerId: 2, button: 0 });
  fireEvent.change(input, { target: { value: 5 } });
  fireEvent.pointerUp(input, { pointerId: 2 });
  expect(screen.getByLabelText("Saved").textContent).toBe("5");
});

it("captures an assistive input value before begin can synchronously rerender the control", () => {
  render(<Harness syncBegin />);
  fireEvent.change(screen.getByLabelText("Test slider"), { target: { value: 7 } });
  expect(screen.getByLabelText("Saved").textContent).toBe("7");
});
