import { Play, Square } from "lucide-react";
import { PRESETS } from "../melody/knobs";
import { MelodyDropdown } from "./MelodyDropdown";
import { Button } from "./primitives";
import type { MelodyPanelProps } from "./MelodyPanel";

type Props = Pick<
  MelodyPanelProps,
  "melody" | "disabled" | "previewId" | "applyPreset" | "previewMelody"
>;
export function MelodyPresets(props: Props) {
  const label = PRESETS[props.melody.preset].label;
  const custom = Object.keys(props.melody.overrides).length > 0;
  return (
    <MelodyDropdown
      label="Preset"
      value={custom ? `Custom (from ${label})` : label}
      disabled={props.disabled}
    >
      {(close) => (
        <>
          <strong>Choose a starting point</strong>
          {(["intent", "mood"] as const).map((kind) => (
            <div key={kind}>
              <h3>{kind === "intent" ? "Intent" : "Mood"}</h3>
              {Object.values(PRESETS)
                .filter((preset) => preset.kind === kind)
                .map((preset) => (
                  <div className="editor-preset-option" key={preset.id}>
                    <span title={preset.blurb}>
                      {preset.label}
                      {props.melody.preset === preset.id ? " ✓" : ""}
                    </span>
                    <Button
                      disabled={props.disabled}
                      aria-label={`Play ${preset.label}`}
                      aria-pressed={props.previewId === `preset-${preset.id}`}
                      onClick={() => {
                        props.previewMelody(
                          { preset: preset.id, overrides: {} },
                          `preset-${preset.id}`,
                        );
                        close();
                      }}
                    >
                      {props.previewId === `preset-${preset.id}` ? (
                        <Square aria-hidden="true" />
                      ) : (
                        <Play aria-hidden="true" />
                      )}
                      <span>Preview</span>
                    </Button>
                    <Button
                      disabled={props.disabled}
                      aria-label={`Use ${preset.label}`}
                      onClick={() => {
                        props.applyPreset(preset.id);
                        close();
                      }}
                    >
                      Use
                    </Button>
                  </div>
                ))}
            </div>
          ))}
        </>
      )}
    </MelodyDropdown>
  );
}
