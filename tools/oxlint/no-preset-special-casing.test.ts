// @vitest-environment node
import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import { noPresetSpecialCasing } from "./no-preset-special-casing.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const options = [
  { presetIds: ["clean", "auto-tune"], registries: ["src/Melody/Knobs.ts"], tables: ["PRESETS"] },
];
const valid = (code: string, filename = "src/Melody/Interpret.ts") => ({
  code,
  filename,
  options,
});
const invalid = (code: string, messageId: string, filename = "src/Melody/Interpret.ts") => ({
  code,
  filename,
  options,
  errors: [{ messageId }],
});

new RuleTester().run("no-preset-special-casing", noPresetSpecialCasing, {
  valid: [
    valid("const knobs = resolveKnobs(melody.preset, melody.overrides);"),
    valid("const label = PRESETS[melody.preset].label;"),
    valid("const selected = props.melody.preset === preset.id;"),
    valid('if (typeof setting.preset !== "string") fail();'),
    valid("if (!Object.hasOwn(PRESETS, setting.preset)) fail();"),
    valid("w.byte(presets.indexOf(tune.melody.preset));"),
    valid('const status = "dirty";'),
    valid('export const DEFAULT_PRESET = "clean";', "/repo/src/Melody/Knobs.ts"),
    valid('const order = ["clean", "auto-tune"];', "/repo/src/Melody/Knobs.ts"),
  ],
  invalid: [
    {
      ...valid('if (melody.preset === "auto-tune") boost();'),
      errors: [{ messageId: "presetComparison" }, { messageId: "presetLiteral" }],
    },
    invalid('const order = ["clean"];', "presetLiteral"),
    invalid("const name = `clean`;", "presetLiteral"),
    invalid("if (melody.preset === DEFAULT_PRESET) skip();", "presetComparison"),
    invalid("if (presetId !== PRESETS.clean.id) skip();", "presetComparison"),
    invalid("const on = melody.preset == mode;", "presetComparison"),
    invalid("switch (melody.preset) { default: break; }", "presetSwitch"),
    invalid("if (SPECIAL.includes(melody.preset)) boost();", "presetMembership"),
    invalid("if (special.has(presetId)) boost();", "presetMembership"),
    invalid("const extra = EXTRA_SCORING[melody.preset];", "presetLookup"),
    invalid(
      "if (melody.preset === DEFAULT_PRESET) skip();",
      "presetComparison",
      "/repo/src/Melody/Knobs.ts",
    ),
  ],
});
