import { DEFAULT_PRESET, PRESETS } from "../melody/knobs";
import { MelodyDropdown } from "./MelodyDropdown";
import { PreviewOption } from "./PreviewOption";
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
      onReset={() => props.applyPreset(DEFAULT_PRESET)}
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
                  <PreviewOption
                    key={preset.id}
                    label={preset.label}
                    title={preset.blurb}
                    selected={props.melody.preset === preset.id}
                    previewing={props.previewId === `preset-${preset.id}`}
                    disabled={props.disabled}
                    previewLabel={`Play ${preset.label}`}
                    useLabel={`Use ${preset.label}`}
                    onPreview={() =>
                      props.previewMelody(
                        { preset: preset.id, overrides: {} },
                        `preset-${preset.id}`,
                      )
                    }
                    onUse={() => {
                      props.applyPreset(preset.id);
                      close();
                    }}
                  />
                ))}
            </div>
          ))}
        </>
      )}
    </MelodyDropdown>
  );
}
