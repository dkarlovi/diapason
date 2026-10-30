import { RotateCcw } from "lucide-react";
import { Button } from "../../UI/Button";

export function ResetControl({
  label,
  disabled,
  onReset,
}: {
  label: string;
  disabled: boolean;
  onReset(): void;
}) {
  const action = `Reset ${label.toLowerCase()}`;
  return (
    <Button
      className="editor-reset"
      aria-label={action}
      title={`${action} to default`}
      disabled={disabled}
      onClick={onReset}
    >
      <RotateCcw aria-hidden="true" />
    </Button>
  );
}
