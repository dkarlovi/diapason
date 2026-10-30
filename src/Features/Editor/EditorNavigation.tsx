import { Button } from "../../UI/Button";
import type { EditorState } from "./useEditor";

export function EditorNavigation({ state }: { state: EditorState }) {
  const v = state.viewport;
  return (
    <div className="editor-navigation">
      <label className="editor-pan" hidden={!v.canPan}>
        <span>
          {v.view.tMin.toFixed(1)}–{v.view.tMax.toFixed(1)} s
        </span>
        <input
          aria-label="Pan shared timeline"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={v.pan}
          onChange={(event) => v.setPan(Number(event.target.value))}
        />
      </label>
      <div className="editor-zoom-actions" role="group" aria-label="Timeline and pitch zoom">
        <Button
          aria-label="Zoom out in time"
          disabled={v.zoom <= 1}
          onClick={() => v.zoomTime(0.5)}
        >
          −
        </Button>
        <span>{Number(v.zoom.toFixed(2))}×</span>
        <Button aria-label="Zoom in in time" disabled={v.zoom >= 32} onClick={() => v.zoomTime(2)}>
          +
        </Button>
        <Button onClick={v.fitTime}>Whole take</Button>
        <Button onClick={v.fitPitch}>Fit</Button>
        <Button aria-label="Show more pitches" onClick={() => v.zoomPitch(0.75)}>
          ↕ −
        </Button>
        <Button aria-label="Show fewer pitches" onClick={() => v.zoomPitch(1.33)}>
          ↕ +
        </Button>
      </div>
    </div>
  );
}
