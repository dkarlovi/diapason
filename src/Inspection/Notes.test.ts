// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../../tests/support/investigation";
import { getView } from "./Views";
import { queryNotes } from "./Notes";
it("joins continuous pitch and explicit intent without approving untouched notes", async () => {
  const { context } = await investigationContext();
  const view = await getView(context, "saved");
  const report = queryNotes(view, {});
  expect(report.data.rows[0]).toMatchObject({
    id: 1,
    intendedMidi: null,
    corrected: false,
    muted: false,
  });
  expect(report.data.rows[0]!.measuredMidi).toBeGreaterThan(83);
  expect(report.data.rows[0]!.measuredMidi).toBeLessThan(84);
  expect(report.data.rows[0]!.source).toEqual(view.evidence.stages.items[0]!.source);
  expect(queryNotes(view, { corrected: true }).data.rows).toEqual([]);
  expect(queryNotes(view, { similarTo: 1, cents: 1 }).data.rows[0]!.distanceCents).toBe(0);
  expect(() => queryNotes(view, { note: 999 })).toThrow(/note/i);
  expect(() => queryNotes(view, { time: { start: NaN, end: 1 } })).toThrow(/time/i);
});
it("paginates the complete selection with explicit source-time selectors", async () => {
  const { context } = await investigationContext();
  const view = await getView(context, "saved");
  const item = view.evidence.stages.items[0]!;
  view.evidence.stages.items = [1, 2, 3].map((id) => ({
    ...item,
    id,
    source: { start: id, end: id + 0.5 },
  }));
  view.evidence.stages.segments = [1, 2, 3].map((id) => ({
    ...view.evidence.stages.segments[0]!,
    source: { start: id, end: id + 0.5 },
  }));
  const all = queryNotes(view, { all: true });
  const page1 = queryNotes(view, { offset: 0, limit: 2 });
  const page2 = queryNotes(view, { offset: 2, limit: 2 });
  expect([...page1.data.rows, ...page2.data.rows]).toEqual(all.data.rows);
  expect(page1.scope).toMatchObject({ total: 3, returned: 2, omitted: 1 });
  expect(page1.nextSteps[0]!.argv).toContain("--offset");
  expect(queryNotes(view, { time: { start: 2, end: 3 } }).data.rows.map((r) => r.id)).toEqual([2]);
  view.evidence.stages.items = [];
  expect(queryNotes(view, {}).scope).toMatchObject({ total: 0, returned: 0 });
});

it("retains explicit pitch intent and mute state when automatic inference removes them", async () => {
  const { investigationInput } = await import("../../tests/support/investigation");
  const { context } = await investigationContext();
  const { input } = await investigationInput("corrected", {
    noteEdits: {
      version: 1,
      pitch: [{ id: "explicit", ranges: [{ start: 0, end: 0.5 }], midi: 84 }],
    },
    muted: [{ t: 0.2, midi: 83 }],
  });
  context.input = input;
  const saved = queryNotes(await getView(context, "saved"), { corrected: true });
  expect(saved.data.rows[0]).toMatchObject({ intendedMidi: 84, corrected: true, muted: true });
  const automatic = queryNotes(await getView(context, "automatic"), { changed: true });
  expect(automatic.data.rows[0]).toMatchObject({
    intendedMidi: null,
    corrected: false,
    muted: false,
    changed: true,
  });
});
