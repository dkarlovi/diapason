import { afterEach, expect, it, vi } from "vitest";
import { autoRange, drawTrace } from "./Trace";
import type { TraceLayer, TraceView } from "./Trace.type";
import { bendSamples, steppedNotes } from "../Melody/PitchCurve";
import type { NoteEvent, Frame } from "../Melody/Notes";
import { scalePitchClasses } from "../Melody/Key";

type Operation = {
  method: string;
  args: unknown[];
  stroke: string;
  fill: string;
  alpha: number;
  dash: number[];
  width: number;
  align: CanvasTextAlign;
  font: string;
};
function surface(width = 100) {
  const operations: Operation[] = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: "",
    fillStyle: "",
    globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop() {} }),
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
    "closePath",
    "moveTo",
    "lineTo",
    "stroke",
    "fillText",
    "arc",
    "fill",
    "strokeRect",
    "save",
    "translate",
    "rotate",
    "restore",
    "rect",
    "clip",
    "drawImage",
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
          align: ctx.textAlign,
          font: ctx.font,
        }),
    });
  }
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: width }, clientHeight: { value: 100 } });
  Object.assign(ctx, { measureText: (text: string) => ({ width: text.length * 6 }) });
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
it("keeps a calibrated band in view during silence and fits pitches outside it", () => {
  const range = { minFreq: 220, maxFreq: 440 };
  expect(autoRange([], range)).toEqual({ midiMin: 55, midiMax: 71 });
  expect(autoRange([frame(0, 880)], range)).toEqual({ midiMin: 55, midiMax: 83 });
});
it("keeps the low range label clear of the live input meter", () => {
  const { canvas, operations } = surface(390);
  drawTrace(canvas, [], {
    ...view,
    inset: true,
    midiMin: 50,
    midiMax: 75,
    preferredRange: { minFreq: 130, maxFreq: 440 },
  });
  const label = operations.find(
    (o) => o.method === "fillText" && String(o.args[0]).startsWith("Low ·"),
  );
  expect(Number(label?.args[2])).toBeLessThanOrEqual(44);
});
it("shades and labels range limits behind a trace that crosses outside the band", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [frame(0, 220), frame(0.1, 880)], {
    ...view,
    midiMin: 50,
    midiMax: 85,
    preferredRange: { minFreq: 220, maxFreq: 440 },
  });
  const band = operations.findIndex((o) => o.method === "fillRect" && o.alpha === 0.08);
  expect(band).toBeGreaterThan(-1);
  const pitch = operations.findIndex((o) => o.method === "arc");
  expect(pitch).toBeGreaterThan(band);
  expect(operations.filter((o) => o.method === "arc")).toHaveLength(2);
  expect(operations.filter((o) => o.method === "fillText").map((o) => o.args[0])).toEqual(
    expect.arrayContaining(["Low · A3", "High · A4"]),
  );
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
  expect(operations.findLast((o) => o.method === "fill")?.fill).toBe("#355f52");
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

it("draws an unnumbered live beat grid before recording", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    beats: { bpm: 120, beatsPerBar: 4 },
    beatOrigin: 0,
    showTimeLabels: false,
  });
  expect(operations).toContainEqual(expect.objectContaining({ method: "moveTo", args: [50.5, 0] }));
  expect(operations.filter((o) => o.method === "fillText")).toEqual([]);
});

it("omits vertical time lines when a live monitor has no tempo", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], { ...view, showTimeLabels: false });
  // Only horizontal pitch lines remain; none end at a time-axis x coordinate.
  expect(operations.filter((o) => o.method === "lineTo").every((o) => o.args[0] === 100)).toBe(
    true,
  );
});

it("highlights the sounding editor note and gives compact notes room within the pitch row", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    noteHeight: 0.68,
    playheadTime: 0.4,
    notes: [{ midi: 69, name: "A4", start: 0.25, duration: 0.5 }],
  });
  const note = operations.find(
    (operation) => operation.method === "fillRect" && operation.args[0] === 25,
  );
  expect(note?.fill).toBe("#b6f2dd");
  expect(note?.args[3]).toBe(17);
});

it("right-aligns inset pitch labels while keeping note text left-aligned", () => {
  const { canvas, operations } = surface(1000);
  drawTrace(canvas, [], {
    ...view,
    inset: true,
    pitchLabels: "all",
    notes: [{ midi: 69, name: "Selected note", start: 0.25, duration: 0.5 }],
  });
  const labels = operations.filter(
    (op) => op.method === "fillText" && /^[A-G]#?\d+$/.test(String(op.args[0])),
  );
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.align).toBe("right");
    expect(label.args[1]).toBe(51);
  }
  expect(
    operations.find((op) => op.method === "fillText" && op.args[0] === "Selected note")?.align,
  ).toBe("left");
});

it("styles live octave labels like editor labels without crowding every semitone", () => {
  const { canvas, operations } = surface(412);
  drawTrace(canvas, [], { ...view, inset: true, midiMin: 60, midiMax: 84 });
  const labels = operations.filter(
    (op) => op.method === "fillText" && /^[A-G]#?\d+$/.test(String(op.args[0])),
  );
  expect(labels.map((op) => op.args[0])).toEqual(["C4", "C5", "C6"]);
  for (const label of labels) {
    expect(label.align).toBe("right");
    expect(label.font).toBe("12px system-ui, sans-serif");
    expect(label.args[1]).toBeCloseTo(35.2);
  }
});
it.each([
  { muted: false, playheadTime: undefined, stripes: 0.6 },
  { muted: true, playheadTime: undefined, stripes: 0.35 },
  { muted: true, playheadTime: 0.2, stripes: 0.35 },
  { muted: false, playheadTime: 0.2, stripes: undefined },
])(
  "stripes edited notes (muted=$muted, playhead=$playheadTime) unless they are sounding",
  ({ muted, playheadTime, stripes }) => {
    const { canvas, operations, ctx } = surface();
    const note = { midi: 69, name: "A4", start: 0.1, duration: 0.5 };
    drawTrace(canvas, [], {
      ...view,
      notes: muted ? [] : [note],
      muted: muted ? [note] : [],
      edited: [note],
      ...(playheadTime === undefined ? {} : { playheadTime }),
    });
    const bands = operations.filter((op) => op.method === "stroke" && op.width === 4);
    expect(bands.map((op) => op.alpha)).toEqual(stripes === undefined ? [] : [stripes]);
    expect(operations.filter((op) => op.method === "clip")).toHaveLength(bands.length);
    expect(operations.some((op) => op.method === "fillText" && op.args[0] === "•")).toBe(false);
    expect(ctx.globalAlpha).toBe(1);
  },
);
it("keeps the name of an edited note readable on a plate above its stripes", () => {
  const { canvas, operations } = surface(400);
  const note = { midi: 69, name: "A4", start: 0.1, duration: 0.5 };
  drawTrace(canvas, [], { ...view, noteHeight: 1, notes: [note], edited: [note] });
  const label = operations.findIndex((op) => op.method === "fillText" && op.args[0] === "A4");
  const bands = operations.findIndex((op) => op.method === "stroke" && op.width === 4);
  const plate = operations
    .slice(0, label)
    .map((op) => op.method)
    .lastIndexOf("fillRect");
  expect(bands).toBeGreaterThan(-1);
  expect(plate).toBeGreaterThan(bands);
  expect(operations[plate]?.args[2]).toBe(17);
});
it("outlines automatic positions of changed notes and links them to the edit", () => {
  const { canvas, operations } = surface();
  const from = { midi: 69, name: "A4", start: 0.1, duration: 0.5 };
  const to = { ...from, midi: 71, name: "B4" };
  const other = { ...from, start: 0.7, duration: 0.2 };
  drawTrace(canvas, [], {
    ...view,
    notes: [to, { ...other, midi: 70 }],
    origins: [
      { from, to, emphasis: true },
      { from: other, to: { ...other, midi: 70 } },
    ],
  });
  const ghosts = operations.filter(
    (op) => op.method === "strokeRect" && op.dash.length && op.stroke === "#8a94a3",
  );
  expect(ghosts.map((op) => op.alpha)).toEqual([1, 0.55]);
  const tethers = operations.filter((op) => op.method === "stroke" && op.width === 1.5);
  expect(tethers.map((op) => op.alpha)).toEqual([1, 0.55]);
  const firstNote = operations.findIndex((op) => op.method === "fillRect" && op.alpha === 0.85);
  expect(firstNote).toBeGreaterThan(operations.indexOf(tethers.at(-1)!));
});
it("reuses the cached background while only the playhead moves", () => {
  const screen = surface();
  const background = surface();
  const layer: TraceLayer = { canvas: background.canvas };
  const frames = [frame(0), frame(0.1)];
  const roll = { ...view, notes: [{ midi: 69, name: "A4", start: 0.25, duration: 0.5 }] };
  drawTrace(screen.canvas, frames, { ...roll, playheadTime: 0.1 }, layer);
  const painted = background.operations.length;
  expect(background.operations).toContainEqual(expect.objectContaining({ stroke: "#355f52" }));
  expect(screen.operations).toContainEqual(expect.objectContaining({ method: "drawImage" }));
  expect(screen.operations).not.toContainEqual(expect.objectContaining({ stroke: "#355f52" }));
  drawTrace(screen.canvas, frames, { ...roll, playheadTime: 0.5 }, layer);
  expect(background.operations).toHaveLength(painted);
  const notes = screen.operations.filter((o) => o.method === "fillRect" && o.args[0] === 25);
  expect(notes.map((o) => o.fill)).toEqual(["#5ad1a8", "#b6f2dd"]);
  drawTrace(screen.canvas, frames, { ...roll, tMax: 2, playheadTime: 0.5 }, layer);
  expect(background.operations.length).toBeGreaterThan(painted);
  const repainted = background.operations.length;
  drawTrace(screen.canvas, [...frames], { ...roll, tMax: 2, playheadTime: 0.6 }, layer);
  expect(background.operations.length).toBeGreaterThan(repainted);
});
it("keeps the canvas allocation stable at fractional device pixel ratios", () => {
  vi.stubGlobal("devicePixelRatio", 1.25);
  const { canvas } = surface(101);
  let resizes = 0;
  const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width")!;
  Object.defineProperty(canvas, "width", {
    get: () => width.get!.call(canvas),
    set: (value: number) => {
      resizes++;
      width.set!.call(canvas, value);
    },
  });
  drawTrace(canvas, [], view);
  drawTrace(canvas, [], view);
  expect(canvas.width).toBe(126);
  expect(resizes).toBe(1);
});

it("shades only out-of-key row bands, including partial rows at the viewport edges", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    midiMin: 60.2,
    midiMax: 63.2,
    scale: scalePitchClasses({ tonic: 0, mode: "major" }),
  });
  const bands = operations.filter(
    (op) => op.method === "fillRect" && op.fill === "#161c24" && op.args[2] === 100,
  );
  expect(bands).toHaveLength(2);
  expect(bands[0]?.args[1]).toBeCloseTo(56.6667, 3);
  expect(bands[0]?.args[3]).toBeCloseTo(33.3333, 3);
  expect(bands[1]?.args[1]).toBeCloseTo(-10, 3);
  expect(operations.indexOf(bands[1]!)).toBeLessThan(
    operations.findIndex((op) => op.method === "stroke"),
  );
});

it.each([false, true])(
  "marks out-of-key bars independently of edits and playback (muted=%s)",
  (muted) => {
    const { canvas, operations } = surface();
    const notes = [69, 70, 71].map((midi, index) => ({
      midi,
      name: "",
      start: index / 3,
      duration: 0.2,
    }));
    drawTrace(canvas, [], {
      ...view,
      scale: scalePitchClasses({ tonic: 0, mode: "major" }),
      notes: muted ? [] : notes,
      muted: muted ? notes : [],
      edited: notes,
      playheadTime: 0.4,
    });
    expect(operations.filter((op) => op.method === "fill" && op.fill === "#ebc078")).toHaveLength(
      1,
    );
    expect(operations.some((op) => op.method === "strokeRect")).toBe(true);
  },
);

it("classifies logical pitches during fractional transposition and includes minor's raised seventh", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    scale: scalePitchClasses({ tonic: 9, mode: "minor" }),
    notePitchOffset: 0.37,
    notes: [67, 68, 70].map((midi, index) => ({
      midi: midi + 0.37,
      name: "",
      start: index / 3,
      duration: 0.2,
    })),
  });
  expect(operations.filter((op) => op.method === "fill" && op.fill === "#ebc078")).toHaveLength(1);
});

it("leaves unknown keys unmarked and unshaded", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], { ...view, notes: [{ midi: 70, name: "A#4", start: 0, duration: 1 }] });
  expect(operations.filter((op) => op.method === "fill" && op.fill === "#ebc078")).toEqual([]);
  expect(operations.filter((op) => op.method === "fillRect" && op.fill === "#161c24")).toEqual([]);
});

it("keeps a short note's label clear of its key marker", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    midiMin: 0,
    midiMax: 4,
    scale: scalePitchClasses({ tonic: 0, mode: "major" }),
    notes: [{ midi: 1, name: "C#-1", start: 0, duration: 0.37 }],
  });
  expect(operations.filter((op) => op.method === "fill" && op.fill === "#ebc078")).toHaveLength(1);
  expect(operations.filter((op) => op.method === "fillText" && op.args[0] === "C#-1")).toEqual([]);
});

it("briefly wobbles only the sounding warning badge without moving its note bar", () => {
  const { canvas, operations } = surface();
  const roll = {
    ...view,
    scale: scalePitchClasses({ tonic: 0, mode: "major" }),
    animateKeyWarnings: true,
    notes: [{ midi: 70, name: "A#4", start: 0, duration: 1 }],
  };
  for (const playheadTime of [0.04, 0.12, 0.8]) drawTrace(canvas, [], { ...roll, playheadTime });
  const angles = operations.filter((op) => op.method === "rotate").map((op) => Number(op.args[0]));
  expect(Math.abs(angles[0]!)).toBeGreaterThan(0);
  expect(angles[1]).not.toBe(angles[0]);
  expect(angles[2]).toBe(0);
  const bars = operations.filter((op) => op.method === "fillRect" && op.alpha === 0.85);
  expect(bars.map((op) => op.args)).toEqual([bars[0]!.args, bars[0]!.args, bars[0]!.args]);
  drawTrace(canvas, [], { ...roll, playheadTime: 0.04, animateKeyWarnings: false });
  expect(operations.findLast((op) => op.method === "rotate")?.args).toEqual([0]);
});

it.each([
  { duration: 0.02, midiMax: 14 },
  { duration: 0.5, midiMax: 100 },
])(
  "sizes warnings to note height and extends narrow badges left ($duration seconds, $midiMax rows)",
  ({ duration, midiMax }) => {
    const { canvas, operations } = surface();
    drawTrace(canvas, [], {
      ...view,
      midiMin: 0,
      midiMax,
      noteHeight: 0.68,
      scale: scalePitchClasses({ tonic: 0, mode: "major" }),
      notes: [{ midi: 10, name: "A#-1", start: 0.1, duration }],
    });
    const bar = operations.find((op) => op.method === "fillRect" && op.alpha === 0.85)!;
    const circle = operations.find((op) => op.method === "arc")!;
    const center = operations.find((op) => op.method === "translate")!;
    const radius = Number(circle?.args[2]);
    expect(radius).toBeCloseTo(Number(bar.args[3]) * 0.4);
    expect(Number(center?.args[0]) + radius).toBeLessThanOrEqual(
      Number(bar.args[0]) + Number(bar.args[2]),
    );
    if (duration === 0.02)
      expect(Number(center.args[0]) - radius).toBeLessThan(Number(bar.args[0]));
  },
);

it("continues disabled row backgrounds through the pitch labels and dims only out-of-key labels", () => {
  const { canvas, operations } = surface();
  drawTrace(canvas, [], {
    ...view,
    inset: true,
    pitchLabels: "all",
    scale: scalePitchClasses({ tonic: 0, mode: "major" }),
  });
  const label = (name: string) =>
    operations.find((op) => op.method === "fillText" && op.args[0] === name);
  expect(label("A#4")?.fill).toBe("#59616b");
  expect(label("A4")?.fill).toBe("#8a94a3");
  expect(label("B4")?.fill).toBe("#8a94a3");
  expect(operations).toContainEqual(
    expect.objectContaining({ method: "fillRect", fill: "#161c24", args: [0, 12.5, 26, 25] }),
  );
});

it("invalidates the background for scale changes and reuses equivalent scales", () => {
  const screen = surface();
  const background = surface();
  const layer: TraceLayer = { canvas: background.canvas };
  const frames: Frame[] = [];
  const major = { ...view, scale: scalePitchClasses({ tonic: 0, mode: "major" }) };
  drawTrace(screen.canvas, frames, major, layer);
  const painted = background.operations.length;
  drawTrace(screen.canvas, frames, { ...major, scale: new Set([11, 9, 7, 5, 4, 2, 0]) }, layer);
  expect(background.operations).toHaveLength(painted);
  drawTrace(
    screen.canvas,
    frames,
    { ...major, scale: scalePitchClasses({ tonic: 1, mode: "major" }) },
    layer,
  );
  expect(background.operations.length).toBeGreaterThan(painted);
});

it("draws a filled contour, clipped edit stripes and a target reference", () => {
  const { canvas, operations } = surface();
  const note: NoteEvent = {
    midi: 69,
    name: "A4",
    start: 0,
    duration: 1,
    bend: {
      glide: 1,
      points: [
        { position: 0, offset: -1 },
        { position: 1, offset: 0 },
      ],
    },
  };
  drawTrace(canvas, [], { ...view, notes: [note], edited: [note] });
  expect(operations.some((o) => o.method === "fill" && o.fill === "#5ad1a8")).toBe(true);
  expect(operations.some((o) => o.method === "clip")).toBe(true);
  expect(operations.some((o) => o.method === "stroke" && o.alpha === 0.3)).toBe(true);
  for (const sample of bendSamples(note)) {
    expect(operations).toContainEqual(
      expect.objectContaining({
        method: "lineTo",
        args: [sample.position * 100, 100 - ((69 + sample.offset - 67) / 4) * 100 - 12.5],
      }),
    );
  }
});
it("draws stepped blocks from the MIDI evaluator while retaining one logical label", () => {
  const { canvas, operations } = surface();
  const note: NoteEvent = {
    midi: 69,
    name: "A4",
    start: 0,
    duration: 1,
    bend: {
      glide: 0.4,
      points: [
        { position: 0, offset: -2 },
        { position: 1, offset: 0 },
      ],
    },
  };
  drawTrace(canvas, [], { ...view, notes: [note] });
  const rects = operations.filter((o) => o.method === "rect" && o.fill === "#5ad1a8");
  expect(rects).toHaveLength(steppedNotes([note]).length);
  expect(operations.filter((o) => o.method === "fillText" && o.args[0] === "A4")).toHaveLength(1);
});
it("draws muted contours as dashed outlines and stable raw handles with a solid destination", () => {
  const { canvas, operations } = surface();
  const points = [
    { position: 0, offset: -1 },
    { position: 0.5, offset: 1 },
    { position: 1, offset: 0 },
  ];
  const note: NoteEvent = {
    midi: 69,
    name: "A4",
    start: 0,
    duration: 1,
    bend: { glide: 0.41, points },
  };
  drawTrace(canvas, [], {
    ...view,
    muted: [note],
    edited: [note],
    bendHandles: { note, points, active: 0 },
  });
  expect(operations.some((o) => o.method === "stroke" && o.dash.join() === "3,3")).toBe(true);
  expect(
    operations
      .filter((o) => o.method === "arc" && o.fill === "#ffffff")
      .map((o) => o.args.slice(0, 2)),
  ).toEqual([
    [0, 75],
    [50, 25],
  ]);
  expect(
    operations.some(
      (o) => o.method === "arc" && o.fill === "#b6f2dd" && o.args[0] === 100 && o.args[1] === 50,
    ),
  ).toBe(true);
});
