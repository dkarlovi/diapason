import { KNOB_DEFS, PRESETS, historicalControls } from "../melody/knobs";
import type { InvestigationContext } from "./types";
import type { EvidenceView } from "./views";
import { pagedReport, type PageOptions } from "./query";
export function queryControls(
  context: InvestigationContext,
  view: EvidenceView,
  options: PageOptions = {},
) {
  const saved = context.input.metadata;
  if (saved.schemaVersion !== 2)
    throw new Error("Saved controls unavailable for a capture-only WAV.");
  const version = saved.tune.noteSource.interpretationVersion;
  const controls = historicalControls(saved.tune.effectiveKnobs, version);
  const current = historicalControls(
    view.evidence.stages.knobs,
    view.tune.noteSource.interpretationVersion,
  );
  const rows = KNOB_DEFS.map((definition) => ({
    key: definition.key,
    definition,
    preset: saved.tune.melody.preset,
    presetValue: PRESETS[saved.tune.melody.preset].knobs[definition.key],
    savedOverride: Object.hasOwn(saved.tune.melody.overrides, definition.key),
    overrideValue: saved.tune.melody.overrides[definition.key] ?? null,
    historicalDefault: controls.defaults.find((item) => item.key === definition.key) ?? null,
    savedValue: controls.values[definition.key],
    currentValue: current.values[definition.key],
    savedInterpretationVersion: version,
    currentInterpretationVersion: view.tune.noteSource.interpretationVersion,
  }));
  return pagedReport(view, "controls", rows, options);
}
