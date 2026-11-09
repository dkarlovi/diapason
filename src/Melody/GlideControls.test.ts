// @vitest-environment node
import { expect, it } from "vitest";
import {
  historicalControls,
  interpretationVersionForControls,
  PRESETS,
  resolveKnobs,
} from "./Knobs";
it("keeps existing presets off and opts into v3 only through the explicit Glide control", () => {
  for (const preset of Object.values(PRESETS)) expect(preset.knobs.glide).toBe(0);
  expect(interpretationVersionForControls(resolveKnobs("clean", {}), {})).toBe(1);
  expect(interpretationVersionForControls(resolveKnobs("auto-tune", {}), {})).toBe(2);
  for (const glide of [0, 0.2, 0.4, 0.41, 1])
    expect(interpretationVersionForControls(resolveKnobs("clean", { glide }), { glide })).toBe(3);
});
it.each([1, 2] as const)("materializes historical zero Glide in v%d", (version) => {
  const { glide, ...old } = PRESETS.clean.knobs;
  expect(glide).toBe(0);
  expect(historicalControls(old, version).values.glide).toBe(0);
});
