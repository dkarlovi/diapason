import { DiapasonMark } from "./DiapasonMark";

/** Shared overlay position keeps branding steady between capture and editing. */
export function EmbeddedBrand() {
  return (
    <span className="embed-canvas-brand" role="img" aria-label="diapason">
      <DiapasonMark />
    </span>
  );
}
