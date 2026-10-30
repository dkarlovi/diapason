// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../../tests/support/investigation";
import { getView } from "./Views";
import { queryStages } from "./Stages";
it("returns complete correspondence for a split saved note and identifies segmentation first", async () => {
  const { context } = await investigationContext();
  const saved = await getView(context, "saved");
  const candidate = structuredClone(saved);
  candidate.name = "automatic";
  const item = saved.evidence.stages.items[0]!;
  const middle = (item.source.start + item.source.end) / 2;
  candidate.evidence.stages.items = [
    { ...item, source: { start: item.source.start, end: middle } },
    { ...item, id: 2, source: { start: middle, end: item.source.end } },
  ];
  const report = queryStages(saved, candidate, { note: item.id });
  expect(report.data.rows[0]).toMatchObject({
    kind: "split",
    currentIndices: [0, 1],
    firstDifferingStage: "segmentation",
  });
  expect(report.data.rows[0]!.current).toHaveLength(2);
  const merged = queryStages(candidate, saved, {});
  expect(merged.data.rows.map((r) => r.kind)).toEqual(["merge", "merge"]);
  candidate.evidence.stages.items = [];
  expect(queryStages(saved, candidate, {}).data.rows[0]!.kind).toBe("missing");
});
