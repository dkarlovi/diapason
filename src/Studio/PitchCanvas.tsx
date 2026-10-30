import type { ComponentProps } from "react";

type PitchCanvasProps = ComponentProps<"canvas"> & { "aria-label": string };

/** Shared pitch surface. The owning screen supplies drawing and interaction. */
export function PitchCanvas({ className = "", children, ...props }: PitchCanvasProps) {
  return (
    <canvas role="img" {...props} className={`trace themed-trace pitch-canvas ${className}`.trim()}>
      {children ?? props["aria-label"]}
    </canvas>
  );
}
