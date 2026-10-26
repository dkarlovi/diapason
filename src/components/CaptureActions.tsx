import type { PropsWithChildren } from "react";
import { ArrowLeft } from "lucide-react";
import { DiapasonMark } from "./DiapasonMark";
import { Button } from "./primitives";

export function CaptureActions({
  back,
  children,
  recording = false,
}: PropsWithChildren<{ back: (() => void) | undefined; recording?: boolean }>) {
  return (
    <div className="capture-actions">
      <span className="capture-back">
        {(back || recording) && (
          <Button onClick={back} disabled={recording} tabIndex={recording ? -1 : undefined}>
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
        )}
      </span>
      <span className="capture-recording-brand" aria-hidden="true" data-recording={recording}>
        <DiapasonMark />
      </span>
      {children}
    </div>
  );
}
