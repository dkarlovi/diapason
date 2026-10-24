import type { PropsWithChildren } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./primitives";

export function CaptureActions({
  back,
  children,
}: PropsWithChildren<{ back: (() => void) | undefined }>) {
  return (
    <div className="capture-actions">
      <span className="capture-back">
        {back && (
          <Button onClick={back}>
            <ArrowLeft aria-hidden="true" /> Back
          </Button>
        )}
      </span>
      {children}
    </div>
  );
}
