import { noNarrativeComments } from "./no-narrative-comments.ts";
import { noPresetSpecialCasing } from "./no-preset-special-casing.ts";

export default {
  meta: { name: "local" },
  rules: {
    "no-narrative-comments": noNarrativeComments,
    "no-preset-special-casing": noPresetSpecialCasing,
  },
};
