import type { AudioRecording } from "../Recording/Recording.type";
import type { Frame } from "../Melody/Notes";
import type {
  CapturedRecordingPackage,
  RecordingPackageV2,
} from "../Recording/RecordingPackage.type";
import { captureRecordingPackage } from "../Recording/RecordingPackage";
import { validateRecordingPackage } from "../Recording/RecordingPackage.validation";
import { encodeTuneMidi } from "../Midi/TuneMidi";
import { resolveRecordingSettings } from "../Recording/RecordingSettings";
import { resolveKnobs } from "../Melody/Knobs";
import { protectedNoteBoundaries } from "../Editing/NoteEdits";
import type { InvestigationContext, StageProvenance } from "./Inspection.type";

function restoredSnapshot(
  value: unknown,
  saved: RecordingPackageV2,
  frames: Frame[],
  record: AudioRecording,
  context: InvestigationContext,
): CapturedRecordingPackage | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("tune" in value) ||
    !("evidence" in value) ||
    !("intent" in value) ||
    !("midiBytes" in value)
  )
    return;
  try {
    const checked = validateRecordingPackage(
      {
        ...saved,
        frames,
        tune: value.tune,
        evidence: value.evidence,
        intent: value.intent,
        midiBytes: value.midiBytes,
      },
      context.input.pcm.length,
      context.input.sampleRate,
    );
    return {
      record,
      pcm: context.input.pcm,
      frames,
      tune: checked.tune,
      intent: checked.intent,
      evidence: checked.evidence,
      context: saved.exported.context,
      exportedAt: saved.exported.at,
    };
  } catch {
    return;
  }
}
/** Cache the combined interpretation/export boundary; preserve package-specific provenance. */
export async function cachedSnapshot(
  context: InvestigationContext,
  record: AudioRecording,
  frames: Frame[],
  frameKey: string | null | undefined,
  provenance: StageProvenance[],
  stage: "edited" | "automatic",
) {
  const saved = context.input.metadata;
  if (saved.schemaVersion !== 2) throw new Error("No saved melody baseline.");
  const settings = resolveRecordingSettings(record);
  const knobs = resolveKnobs(settings.melody.preset, settings.melody.overrides);
  const identify = (stage: string, dependencies: unknown) =>
    context.execution.codeRuntimeKey && frameKey ? context.stageKey?.(stage, dependencies) : null;
  const segments = identify("segments", {
    frames: frameKey,
    levelGate: knobs.levelGate,
    silenceGapMs: knobs.silenceGapMs,
    steadiness: knobs.steadiness,
    minNoteMs: knobs.minNoteMs,
    boundaries: protectedNoteBoundaries(record.noteEdits),
  });
  const interpretation = identify("interpretation", {
    segments,
    knobs,
    key: settings.melody.key,
    timing: [record.bpm, record.beatsPerBar],
    acousticRange: frameKey,
    version: context.execution.interpretationVersion,
  });
  const key = identify(stage, {
    interpretation,
    wavSha256: context.identity.wavSha256,
    intent: { edits: record.noteEdits, muted: record.muted },
    play: settings.play,
  });
  let snapshot = key
    ? restoredSnapshot(await context.stages.read(key), saved, frames, record, context)
    : undefined;
  const disposition = snapshot ? "reused" : "recomputed";
  if (!snapshot) {
    snapshot = captureRecordingPackage(
      record,
      context.input.pcm,
      frames,
      saved.exported.context,
      saved.exported.at,
    );
    if (key)
      await context.stages.write(key, {
        schemaVersion: 1,
        tune: snapshot.tune,
        evidence: snapshot.evidence,
        intent: snapshot.intent,
        midiBytes: Array.from(
          new Uint8Array(await (await encodeTuneMidi(snapshot.tune)).arrayBuffer()),
        ),
      });
  }
  provenance.push({
    stage,
    key: key ?? "unavailable",
    disposition,
    inputs: [
      segments ?? "segments",
      interpretation ?? "interpretation",
      "intent",
      "play",
      "wavSha256",
    ],
  });
  return snapshot;
}
