import { useRef, useState, type RefObject } from "react";
import { bendEditFor, resetBendEdit, setBendEdit } from "../../Editing/BendEdits";
import { captureEditSnapshot } from "../../Editing/EditState";
import { processRecording } from "../../Recording/Processing";
import type { Recording } from "../../Recording/Recording.type";
import type { NoteItem } from "../../Recording/NoteItem.type";
import type { EditSnapshot } from "../../Recording/RecordingEdit.type";
import type { Frame } from "../../Melody/Notes";
import type { Segment } from "../../Melody/Decode.type";
import type { PitchPoint } from "../../Melody/PitchCurve.type";
import type { TraceView } from "../../Audio/Trace.type";
import { useBendDrag } from "./useBendDrag";

interface Options {
  recordRef: RefObject<Recording | null>;
  record: Recording | null;
  selected: NoteItem | undefined;
  frames: Frame[];
  view: TraceView;
  rollRef: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  active: boolean;
  glide: number;
  selectPoint?: (index: number) => void;
  begin(label: string): void;
  update(snapshot: EditSnapshot): void;
  commit(): void;
  cancel(): void;
  change(label: string, transform: (record: Recording) => Recording): void;
}
const FLAT: PitchPoint[] = [
  { position: 0, offset: 0 },
  { position: 1 / 3, offset: 0 },
  { position: 2 / 3, offset: 0 },
  { position: 1, offset: 0 },
];

function editedPoint(
  points: PitchPoint[],
  index: number,
  position: number,
  offset: number,
): PitchPoint[] {
  return points.map((point, i) => (i === index ? { position, offset } : point));
}
export function useBendEditing(options: Options) {
  const { selected, recordRef, frames, glide } = options;
  const [activeIndex, setActiveIndex] = useState(0);
  const manual = selected ? bendEditFor(options.record?.noteEdits, selected.source) : undefined;
  const points = manual?.points ?? selected?.automatic.bend?.points ?? FLAT;
  const active = Math.min(activeIndex, points.length - 2);
  const baseline = useRef<{
    record: Recording;
    segment: Segment;
    points: PitchPoint[];
    id: string;
  } | null>(null);
  const snapshot = () => {
    const record = recordRef.current;
    if (!record || !selected) return null;
    const processed = processRecording(record, frames);
    const segment = processed.interpretation.segments.find(
      (value) =>
        value.source.start === selected.source.start && value.source.end === selected.source.end,
    );
    return segment ? { record, segment, points, id: crypto.randomUUID() } : null;
  };
  const claims = useBendDrag({
    rollRef: options.rollRef,
    selected,
    points,
    view: options.view,
    enabled: options.enabled && glide > 0.4,
    active: options.active,
    begin(index) {
      baseline.current = snapshot();
      setActiveIndex(index);
      options.selectPoint?.(index);
      options.begin("Edit bend");
    },
    update(index, position, offset) {
      const initial = baseline.current;
      if (!initial) return;
      const next = {
        ...initial.record,
        noteEdits: setBendEdit(
          initial.record.noteEdits,
          initial.segment,
          editedPoint(initial.points, index, position, offset),
          initial.id,
        ),
      };
      options.update(captureEditSnapshot(next));
    },
    commit: () => options.commit(),
    cancel: () => options.cancel(),
  });
  const changePoint = (position: number, offset: number) => {
    if (!options.enabled || glide <= 0.4 || !selected) return;
    const initial = snapshot();
    if (!initial) return;
    const point = points[active]!;
    const previous = points[Math.max(0, active - 1)]!.position;
    const next = points[active + 1]!.position;
    const margin = Math.min(0.02, (point.position - previous) / 2, (next - point.position) / 2);
    const x = active ? Math.max(previous + margin, Math.min(next - margin, position)) : 0;
    const y = Math.max(-48, -selected.note.midi, Math.min(48, 127 - selected.note.midi, offset));
    if (x === point.position && y === point.offset) return;
    options.change("Edit bend", (record) => ({
      ...record,
      noteEdits: setBendEdit(
        record.noteEdits,
        initial.segment,
        editedPoint(points, active, x, y),
        initial.id,
      ),
    }));
  };
  return {
    points,
    active,
    setActive(index: number) {
      setActiveIndex(index);
      options.selectPoint?.(index);
    },
    claims,
    visible: !!selected && glide > 0.4,
    edited: !!manual,
    changePoint,
    reset() {
      if (!selected || !manual || !options.enabled) return;
      options.change("Reset bend", (record) => ({
        ...record,
        noteEdits: resetBendEdit(record.noteEdits, selected.source),
      }));
    },
  };
}
