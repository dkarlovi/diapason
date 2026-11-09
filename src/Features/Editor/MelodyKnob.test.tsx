import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KNOB_DEFS } from "../../Melody/Knobs";
import { MelodyKnob } from "./MelodyKnob";

afterEach(cleanup);
function Harness() {
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const current = useRef(value);
  const baseline = useRef(value);
  return (
    <>
      <MelodyKnob
        def={KNOB_DEFS.find((def) => def.key === "glide")!}
        value={value}
        disabled={false}
        onChange={vi.fn()}
        onReset={vi.fn()}
        onPreview={vi.fn()}
        previewId={null}
        gesture={{
          active,
          begin() {
            baseline.current = current.current;
            setActive(true);
          },
          update(next) {
            current.current = next;
            setValue(next);
          },
          commit() {
            setActive(false);
            setSaved((values) => [...values, current.current]);
          },
          cancel() {
            current.current = baseline.current;
            setValue(baseline.current);
            setActive(false);
          },
        }}
      />
      <output aria-label="Saved">{saved.join(",")}</output>
    </>
  );
}
it("crosses all Glide detents by keyboard and moves freely through the smooth range", () => {
  render(<Harness />);
  const input = screen.getByRole("slider", { name: "Glide" });
  for (const value of [0.2, 0.4, 0.41, 0.42]) {
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyUp(input, { key: "ArrowRight" });
    expect(input).toHaveProperty("value", String(value));
  }
  expect(input.getAttribute("aria-valuetext")).toBe("Smooth · 42%");
  for (const value of [0.41, 0.4, 0.2, 0]) {
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyUp(input, { key: "ArrowDown" });
    expect(input).toHaveProperty("value", String(value));
  }
});
it("snaps pointer input, groups held key changes and cancels Escape", () => {
  render(<Harness />);
  const input = screen.getByRole("slider", { name: "Glide" });
  fireEvent.change(input, { target: { value: 0.23 } });
  expect(input).toHaveProperty("value", "0.2");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "ArrowUp", repeat: true });
  expect(input).toHaveProperty("value", "0.41");
  expect(screen.getByLabelText("Saved").textContent).toBe("0.2");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyUp(input, { key: "ArrowUp" });
  expect(input).toHaveProperty("value", "0.2");
});
it("supports Home, End and page movement without trapping a detent", () => {
  render(<Harness />);
  const input = screen.getByRole("slider", { name: "Glide" });
  for (const [key, value] of [
    ["End", 1],
    ["PageDown", 0.9],
    ["Home", 0],
    ["PageUp", 0.2],
  ] as const) {
    fireEvent.keyDown(input, { key });
    fireEvent.keyUp(input, { key });
    expect(input).toHaveProperty("value", String(value));
  }
});
