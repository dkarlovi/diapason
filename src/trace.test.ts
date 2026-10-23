import { afterEach, expect, it, vi } from "vitest";
import { autoRange, drawTrace, type TraceView } from "./trace";
import type { Frame } from "./notes";

type Operation = {
  method: string;
  args: unknown[];
  stroke: string;
  fill: string;
  alpha: number;
  dash: number[];
  width: number;
};
function surface() {
  const operations: Operation[] = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: "",
    fillStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    setLineDash(value: number[]) {
      dash = value;
    },
  } as unknown as CanvasRenderingContext2D;
  for (const method of [
    "setTransform",
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fillText",
    "arc",
    "fill",
    "strokeRect",
  ] as const) {
    Object.assign(ctx, {
      [method]: (...args: unknown[]) =>
        operations.push({
          method,
          args,
          stroke: String(ctx.strokeStyle),
          fill: String(ctx.fillStyle),
          alpha: ctx.globalAlpha,
          dash: [...dash],
          width: ctx.lineWidth,
        }),
    });
  }
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: 100 }, clientHeight: { value: 100 } });
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx);
  return { canvas, operations, ctx };
}
const view: TraceView = { tMin: 0, tMax: 1, midiMin: 67, midiMax: 71 };
const frame = (t: number, freq: number | null = 440, clarity = 0.99): Frame => ({
  t,
  freq,
  clarity,
  rms: 0.1,
});
afterEach(() => vi.unstubAllGlobals());
it("fits voiced pitches and supplies an empty-input range", () => {
  expect(autoRange([])).toEqual({ midiMin: 67, midiMax: 96 });
  expect(autoRange([frame(0), frame(1, null)])).toEqual({ midiMin: 67, midiMax: 73 });
});
it("sizes for device pixels and places beat subdivisions on the time axis", () => {
  vi.stubGlobal("devicePixelRatio", 2);
  const { canvas, operations } = surface();
  drawTrace(canvas, [], { ...view, beats: { bpm: 120, beatsPerBar: 4, subdivision: 2 } });
  expect([canvas.width, canvas.height]).toEqual([200, 200]);
  expect(operations[0]).toMatchObject({ method: "setTransform", args: [2, 0, 0, 2, 0, 0] });
  expect(operations).toContainEqual(expect.objectContaining({ method: "moveTo", args: [25.5, 0] }));
  expect(operations.filter((o) => o.method === "stroke").map((o) => o.stroke)).toEqual([
    "#222a34",
    "#222a34",
    "#222a34",
    "#222a34",
    "#222a34",
    "#45536a",
    "#161c24",
    "#2a3441",
    "#161c24",
    "#2a3441",
  ]);
});
it("breaks pitch lines at silence and out-of-window frames", () => {
  const { canvas, operations } = surface();
  drawTrace(
    canvas,
    [frame(-1), frame(0), frame(0.1), frame(0.2, null), frame(0.3), frame(2), frame(0.4, 440, 0.9)],
    view,
  );
  expect(operations.filter((o) => o.method === "arc")).toHaveLength(4);
  expect(operations.filter((o) => o.method === "stroke" && o.stroke === "#5ad1a8")).toHaveLength(1);
  expect(operations.filter((o) => o.method === "fill").at(-1)?.fill).toBe("#355f52");
});
it("layers faint traces behind dashed muted and solid active notes and restores canvas state", () => {
  const { canvas, operations, ctx } = surface();
  const note = { midi: 69, name: "A4", start: 0.25, duration: 0.5 };
  const roll = { ...view, notes: [note, { ...note, duration: 0.01 }], muted: [note] };
  drawTrace(canvas, [frame(0), frame(0.1)], roll);
  const faint = operations.findIndex((o) => o.method === "stroke" && o.stroke === "#355f52");
  const outlines = operations.filter((o) => o.method === "strokeRect");
  expect(outlines.map((o) => o.dash)).toEqual([[3, 3], [], []]);
  expect(outlines[0]?.args).toEqual([25.5, 38, 49, 24]);
  expect(faint).toBeLessThan(operations.findIndex((o) => o.method === "strokeRect"));
  expect(operations.filter((o) => o.method === "fillText" && o.args[0] === "A4")).toHaveLength(1);
  expect(operations.some((o) => o.method === "fillRect" && o.alpha === 0.85)).toBe(true);
  expect(ctx.globalAlpha).toBe(1);
  drawTrace(canvas, [], view);
  expect(operations.at(-1)?.dash).toEqual([]);
});
it("keeps coordinates finite for degenerate view ranges and labels octaves", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [frame(0)], {
    tMin: 0,
    tMax: 0,
    midiMin: 72,
    midiMax: 72,
    beats: { bpm: 0, beatsPerBar: 4 },
  });
  expect(operations).toContainEqual(
    expect.objectContaining({ method: "fillText", args: ["C5", 3, 94] }),
  );
  expect(
    operations
      .flatMap((o) => o.args)
      .filter((a) => typeof a === "number")
      .every(Number.isFinite),
  ).toBe(true);
});

it("anchors moving beat bars to the downbeat and includes count-in beats", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    tMin: 8,
    tMax: 12,
    beats: { bpm: 120, beatsPerBar: 4 },
    beatOrigin: 10,
    playheadTime: 10.5,
  });
  expect(operations).toContainEqual(expect.objectContaining({ method: "moveTo", args: [25.5, 0] }));
  expect(operations).toContainEqual(
    expect.objectContaining({ method: "moveTo", args: [50.5, 0], stroke: "#45536a" }),
  );
  expect(operations).toContainEqual(
    expect.objectContaining({ method: "fillText", args: ["Count-in", 3.5, 2] }),
  );
});
