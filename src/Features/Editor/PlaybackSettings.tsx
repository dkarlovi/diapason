import { INSTRUMENTS, DEFAULT_PLAY } from "../../Playback/Instruments";
import { MelodyDropdown } from "./MelodyDropdown";
import { PreviewOption } from "./PreviewOption";
import type { EditorState } from "./useEditor";

export function PlaybackSettings({
  state,
  onPreview = state.previewPlay,
}: {
  state: EditorState;
  onPreview?: EditorState["previewPlay"];
}) {
  const fields = [
    {
      label: "Instrument",
      key: "instrument" as const,
      disabled: state.editingDisabled,
      options: INSTRUMENTS.map(({ id, label }) => ({ value: id, label })),
    },
    {
      label: "Octave",
      key: "octave" as const,
      disabled: state.editingDisabled,
      options: [1, 0, -1, -2, -3].map((value) => ({
        value,
        label:
          value === 0
            ? "Original octave"
            : `${value > 0 ? "+" : "−"}${Math.abs(value)} octave${Math.abs(value) > 1 ? "s" : ""}`,
      })),
    },
  ];
  return (
    <div className="editor-playback-settings">
      {fields.map((field) => (
        <MelodyDropdown
          key={field.key}
          label={field.label}
          value={
            field.options.find((option) => option.value === state.play[field.key])?.label ?? ""
          }
          disabled={field.disabled}
          onReset={() => {
            state.stopPlayback();
            state.changePlay({ ...state.play, [field.key]: DEFAULT_PLAY[field.key] });
          }}
        >
          {(close) =>
            field.options.map((option) => (
              <PreviewOption
                key={option.value}
                label={option.label}
                selected={state.play[field.key] === option.value}
                previewing={state.previewId === `play-${field.key}-${option.value}`}
                disabled={field.disabled}
                previewLabel={`Preview ${field.label} ${option.label}`}
                useLabel={`Use ${field.label} ${option.label}`}
                onPreview={() =>
                  onPreview(
                    { ...state.play, [field.key]: option.value },
                    `play-${field.key}-${option.value}`,
                    `${field.label}: ${option.label}`,
                  )
                }
                onUse={() => {
                  state.stopPlayback();
                  state.changePlay({ ...state.play, [field.key]: option.value });
                  close();
                }}
              />
            ))
          }
        </MelodyDropdown>
      ))}
    </div>
  );
}
