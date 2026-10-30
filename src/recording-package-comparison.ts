import type { AudioRecording } from "./Recording/Recording.type";
import type { Frame } from "./notes";
import { encodeTuneMidi } from "./tune-midi";
import { BUILD_INFO } from "./build-info";
import { captureRecordingPackage, restoreRecordingPackage } from "./recording-package";
import { analyzeRecording } from "./recording-analysis";
import { firstDifference, NUMERIC_COMPARISON_TOLERANCE } from "./diagnostics-validation";
import type {
  CapturedRecordingPackage,
  ProcessingEvidence,
  ReadRecordingPackage,
  RecordingPackageV2,
} from "./recording-package-types";
import type { SourceRange } from "./note-edits";
import { historicalControls } from "./melody/knobs";

export interface SourceMatch {
  savedIndex: number | null;
  currentIndices: number[];
  kind: "matched" | "split" | "merge" | "missing" | "extra";
}
interface SourceItem {
  source: SourceRange;
}
export function matchSourceItems(saved: SourceItem[], current: SourceItem[]): SourceMatch[] {
  const overlaps = saved.map((a) =>
    current.flatMap((b, i) =>
      a.source.start < b.source.end && b.source.start < a.source.end ? [i] : [],
    ),
  );
  const uses = new Map<number, number>();
  for (const indices of overlaps)
    for (const index of indices) uses.set(index, (uses.get(index) ?? 0) + 1);
  return [
    ...overlaps.map((indices, savedIndex): SourceMatch => ({
      savedIndex,
      currentIndices: indices,
      kind: !indices.length
        ? "missing"
        : indices.length > 1
          ? "split"
          : uses.get(indices[0]!)! > 1
            ? "merge"
            : "matched",
    })),
    ...current.flatMap((_, index): SourceMatch[] =>
      uses.has(index) ? [] : [{ savedIndex: null, currentIndices: [index], kind: "extra" }],
    ),
  ];
}
export interface MelodyDifference extends SourceMatch {
  intent: "corrected" | "muted" | "unapproved";
  deltas: {
    currentIndex: number;
    semitones: number;
    cents: number;
    startSeconds: number;
    durationSeconds: number;
  }[];
}
export function compareSavedMelody(
  saved: ProcessingEvidence,
  current: ProcessingEvidence,
): { matches: boolean; differences: MelodyDifference[] } {
  const a = saved.stages.items,
    b = current.stages.items;
  const differences = matchSourceItems(a, b).flatMap((match): MelodyDifference[] => {
    const item = match.savedIndex === null ? undefined : a[match.savedIndex];
    if (match.kind === "matched" && item) {
      const other = b[match.currentIndices[0]!]!;
      if (
        firstDifference(
          [item.source, item.automatic, item.note, item.muted],
          [other.source, other.automatic, other.note, other.muted],
          "item",
        ) === null
      )
        return [];
    }
    return [
      {
        ...match,
        intent: item?.muted ? "muted" : item?.editState.axes.length ? "corrected" : "unapproved",
        deltas: item
          ? match.currentIndices.map((index) => {
              const other = b[index]!;
              return {
                currentIndex: index,
                semitones: other.note.midi - item.note.midi,
                cents: (other.note.midi - item.note.midi) * 100,
                startSeconds: other.note.start - item.note.start,
                durationSeconds: other.note.duration - item.note.duration,
              };
            })
          : [],
      },
    ];
  });
  return {
    matches:
      differences.length === 0 && firstDifference(saved.notes, current.notes, "notes") === null,
    differences,
  };
}
export interface PackageComparison {
  status: "match" | "mismatch" | "incomplete";
  numericTolerance: number;
  difference: string | null;
  build: "same" | "different" | "unknown";
  saved: ReadRecordingPackage["metadata"];
  edited?: CapturedRecordingPackage;
  automatic?: CapturedRecordingPackage;
  editedDifferences?: ReturnType<typeof compareSavedMelody>;
  automaticDifferences?: ReturnType<typeof compareSavedMelody>;
}
export async function compareRecordingPackage(
  input: ReadRecordingPackage,
  acousticFrames?: Frame[],
  capture?: (
    record: AudioRecording,
    view: "edited" | "automatic",
  ) => Promise<CapturedRecordingPackage>,
): Promise<PackageComparison> {
  const saved = input.metadata;
  if (saved.schemaVersion !== 2)
    return {
      status: "incomplete",
      numericTolerance: NUMERIC_COMPARISON_TOLERANCE,
      difference: "Capture-only WAV has no saved melody baseline.",
      build: "unknown",
      saved,
    };
  const record = await restoreRecordingPackage(input, "", "restore");
  const frames = acousticFrames ?? analyzeRecording(input.pcm, input.sampleRate, record);
  const snapshot = (value: AudioRecording, view: "edited" | "automatic") =>
    capture
      ? capture(value, view)
      : captureRecordingPackage(
          value,
          input.pcm,
          frames,
          saved.exported.context,
          saved.exported.at,
        );
  const edited = await snapshot(record, "edited");
  const freshRecord = { ...record };
  delete freshRecord.noteEdits;
  delete freshRecord.muted;
  const automatic = await snapshot(freshRecord, "automatic");
  const expected = { ...replayObservation(saved), midiBytes: saved.midiBytes };
  const actual = {
    ...replayObservation(edited),
    midiBytes: Array.from(new Uint8Array(await (await encodeTuneMidi(edited.tune)).arrayBuffer())),
  };
  const difference = firstDifference(expected, actual, "replay");
  const origin = saved.exported.context.build;
  const build =
    origin.source === "unknown" || BUILD_INFO.source === "unknown"
      ? "unknown"
      : JSON.stringify(origin) === JSON.stringify(BUILD_INFO)
        ? "same"
        : "different";
  return {
    status: difference === null ? "match" : "mismatch",
    numericTolerance: NUMERIC_COMPARISON_TOLERANCE,
    difference,
    build,
    saved,
    edited,
    automatic,
    editedDifferences: compareSavedMelody(saved.evidence, edited.evidence),
    automaticDifferences: compareSavedMelody(saved.evidence, automatic.evidence),
  };
}

export function replayObservation(value: Pick<RecordingPackageV2, "frames" | "evidence" | "tune">) {
  const version = value.tune.noteSource.interpretationVersion;
  return {
    frames: value.frames,
    evidence: {
      ...value.evidence,
      settings: { ...value.evidence.settings, origins: undefined },
      stages: {
        ...value.evidence.stages,
        knobs: historicalControls(value.evidence.stages.knobs, version).values,
      },
    },
    tune: {
      ...value.tune,
      effectiveKnobs: historicalControls(value.tune.effectiveKnobs, version).values,
    },
  };
}
