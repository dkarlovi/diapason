import { midiToName } from "./notes";
import type { ReadRecordingPackage } from "./Recording/RecordingPackage.type";
import type { PackageComparison } from "./recording-package-comparison";
export function formatPackageInspection(input: ReadRecordingPackage): string {
  const p = input.metadata;
  const r = p.recording;
  const lines = [
    r.name,
    `${r.bpm} BPM · ${r.beatsPerBar}/4 · ${input.pcm.length / input.sampleRate}s · ${input.sampleRate} Hz`,
    `Schema ${p.schemaVersion}; capture build ${p.provenance.build.revision}`,
  ];
  if (p.schemaVersion === 1)
    return [...lines, "Capture-only WAV: saved melody comparison unavailable."].join("\n");
  lines.push(
    `Export build ${p.exported.context.build.revision}; pipeline ${p.exported.context.build.pipeline}`,
    `Audio SHA-256 ${p.audio.sha256}`,
    `Settings: ${JSON.stringify(p.evidence.settings)}`,
    `Playback: ${p.tune.play.instrument}, octave ${p.tune.play.octave} (MIDI includes this transformation)`,
    `Quality: ${JSON.stringify(p.evidence.quality)}`,
    `Key: ${JSON.stringify(p.evidence.stages.key)}`,
    `Harmony: ${JSON.stringify(p.evidence.stages.harmony)}`,
    `Frames: ${p.frames.length}; logical notes: ${p.evidence.notes.length}`,
  );
  for (const item of p.evidence.stages.items)
    lines.push(
      `#${item.id} ${item.source.start}–${item.source.end}s: ${midiToName(item.automatic.midi)} → ${midiToName(item.note.midi)}${item.muted ? " [muted]" : ""}${item.editState.axes.length ? " [corrected]" : " [unapproved]"}`,
    );
  for (const edit of p.evidence.stages.editCoverage)
    lines.push(`Edit ${edit.id}: ${edit.status}, missing ${JSON.stringify(edit.missing)}`);
  return lines.join("\n");
}
export function formatPackageComparison(result: PackageComparison): string {
  return [
    `Edited replay: ${result.status}; build: ${result.build}`,
    `First difference: ${result.difference ?? "none"}`,
    `Numeric tolerance: ${result.numericTolerance}; MIDI bytes must match exactly.`,
    "Pitches below are logical; generated MIDI applies saved instrument and playback octave.",
    `Edited differences: ${JSON.stringify(result.editedDifferences ?? null, null, 2)}`,
    `Automatic versus saved intention: ${JSON.stringify(result.automaticDifferences ?? null, null, 2)}`,
    "Corrected notes express intent; untouched notes are unapproved. Mutes do not establish unvoiced audio.",
  ].join("\n");
}
