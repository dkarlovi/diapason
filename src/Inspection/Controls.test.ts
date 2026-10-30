// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../../tests/support/investigation";
import { getView } from "./Views";
import { queryControls } from "./Controls";
it("distinguishes explicit zero overrides from preset values and historical defaults", async () => {
  const { context } = await investigationContext();
  const p = context.input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  p.tune.melody.overrides.contextCorrection = 0;
  const report = queryControls(context, await getView(context, "saved"));
  expect(report.data.rows.find((r) => r.key === "contextCorrection")).toMatchObject({
    savedOverride: true,
    overrideValue: 0,
    savedValue: 0,
    currentValue: 0,
    definition: { min: 0, max: 1, step: 0.01 },
  });
  delete p.tune.melody.overrides.contextCorrection;
  p.tune.effectiveKnobs = Object.fromEntries(
    Object.entries(p.tune.effectiveKnobs).filter(([key]) => key !== "contextCorrection"),
  ) as typeof p.tune.effectiveKnobs;
  const historical = queryControls(context, await getView(context, "saved"));
  expect(historical.data.rows.find((r) => r.key === "contextCorrection")).toMatchObject({
    savedOverride: false,
    historicalDefault: { value: 0 },
  });
});
