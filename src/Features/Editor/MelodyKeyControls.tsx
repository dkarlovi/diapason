import { PreviewOption } from "./PreviewOption";
import { MelodyDropdown } from "./MelodyDropdown";
import { keyName, type Key } from "../../Melody/Key";
import type { KeyChoice } from "../../Melody/Interpret";
import type { MelodyPanelProps } from "./MelodyPanel.type";

type Props = Pick<
  MelodyPanelProps,
  "melody" | "interpretation" | "disabled" | "previewId" | "changeKey" | "previewMelody"
>;
const keys: Key[] = Array.from({ length: 12 }, (_, tonic) => [
  { tonic, mode: "major" as const },
  { tonic, mode: "minor" as const },
]).flat();
const keyValue = (key: Key) => `${key.tonic}-${key.mode}`;
function KeyOption({ choice, props, close }: { choice: KeyChoice; props: Props; close(): void }) {
  const auto = choice === "auto";
  const label = auto ? "Auto" : keyName(choice);
  const id = `key-${auto ? "auto" : keyValue(choice)}`;
  const selected = auto
    ? props.melody.key === "auto"
    : props.melody.key !== "auto" && keyValue(props.melody.key) === keyValue(choice);
  const previewing = props.previewId === id;
  return (
    <PreviewOption
      label={label}
      selected={selected}
      previewing={previewing}
      disabled={props.disabled}
      previewLabel={auto ? "Play Auto key" : `Play key ${label}`}
      useLabel={auto ? "Use Auto key" : `Use key ${label}`}
      onPreview={() => props.previewMelody({ key: choice }, id)}
      onUse={() => {
        props.changeKey(choice);
        close();
      }}
    />
  );
}
export function MelodyKeyControls(props: Props) {
  const chosen = props.interpretation?.key.chosen;
  const label =
    props.melody.key === "auto"
      ? `Auto${chosen ? ` · ${keyName(chosen)}` : ""}`
      : keyName(props.melody.key);
  const suggestions = props.interpretation?.key.ranked.slice(0, 3).map(({ key }) => key) ?? [];
  const suggested = new Set(suggestions.map(keyValue));
  const groups = [
    { label: "Suggested", keys: suggestions },
    { label: "All keys", keys: keys.filter((key) => !suggested.has(keyValue(key))) },
  ];
  return (
    <MelodyDropdown
      label="Key"
      value={label}
      disabled={props.disabled}
      onReset={() => props.changeKey("auto")}
    >
      {(close) => (
        <>
          <strong>Choose a key</strong>
          <KeyOption choice="auto" props={props} close={close} />
          {groups
            .filter((group) => group.keys.length)
            .map((group) => (
              <div key={group.label}>
                <h3>{group.label}</h3>
                {group.keys.map((key) => (
                  <KeyOption key={keyValue(key)} choice={key} props={props} close={close} />
                ))}
              </div>
            ))}
        </>
      )}
    </MelodyDropdown>
  );
}
