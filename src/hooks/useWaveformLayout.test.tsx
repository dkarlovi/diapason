import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WaveformThumbnail } from "../components/WaveformThumbnail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("uses native SVG viewport lengths to align the cutout with labels after resizing", () => {
  let narrow = false;
  let resize!: () => void;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("recording-waveform"))
      return new DOMRect(10, 10, narrow ? 362 : 550, 90);
    if (this.classList.contains("recording-info"))
      return new DOMRect(narrow ? 72 : 80, narrow ? 26 : 30, 200, 48);
    return new DOMRect();
  });
  const { container } = render(
    <article>
      <WaveformThumbnail summary={{ version: 1, rms: new Float32Array([0, 1]) }} />
      <div className="recording-info">Melody</div>
    </article>,
  );
  const cutout = container.querySelector(".recording-waveform-cutout")!;
  expect(cutout.getAttribute("x")).toBe("70");
  expect(cutout.getAttribute("y")).toBe("20");
  expect(cutout.getAttribute("width")).toBe("480");
  expect(cutout.getAttribute("height")).toBe("48");
  narrow = true;
  act(() => resize());
  expect(cutout.getAttribute("x")).toBe("62");
  expect(cutout.getAttribute("y")).toBe("16");
  expect(cutout.getAttribute("width")).toBe("300");
  expect(cutout.getAttribute("height")).toBe("48");
});
