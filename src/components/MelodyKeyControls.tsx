import { Play, Square } from "lucide-react";
import { Button } from "./primitives";
import { MelodyDropdown } from "./MelodyDropdown";
import { keyName, type Key } from "../melody/key";
import type { KeyChoice } from "../melody/interpret";
import type { MelodyPanelProps } from "./MelodyPanel";

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
    <div className="editor-preset-option">
      <span>
        {label}
        {selected ? " ✓" : ""}
      </span>
      <Button
        disabled={props.disabled}
        aria-label={auto ? "Play Auto key" : `Play key ${label}`}
        aria-pressed={previewing}
        onClick={() => {
          props.previewMelody({ key: choice }, id);
          close();
        }}
      >
        {previewing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span>Preview</span>
      </Button>
      <Button
        disabled={props.disabled}
        aria-label={auto ? "Use Auto key" : `Use key ${label}`}
        onClick={() => {
          props.changeKey(choice);
          close();
        }}
      >
        Use
      </Button>
    </div>
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
    <MelodyDropdown label="Key" value={label} disabled={props.disabled}>
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
