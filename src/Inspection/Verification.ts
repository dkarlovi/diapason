import { replayObservation } from "../Recording/RecordingPackageComparison";
import {
  compareValues,
  NUMERIC_COMPARISON_TOLERANCE,
  type ValueComparison,
} from "../Diagnostics/Diagnostics.validation";
import { readTuneMidiMusic } from "../Midi/TuneMidiReader";
import { encodeTuneMidi } from "../Midi/TuneMidi";
import { PROGRAMS } from "../Midi/MidiPlayback";
import { wavBytes } from "../Encoding/Wav";
import { decodeWav } from "../Encoding/WavReader";
import { verifyImportModes } from "./Imports";
import { logicalPlaybackEvents, tunePlaybackEvents } from "./Events";
import { computeComparison } from "./Computation";
import type { StageProvenance } from "./Inspection.type";
import { makeReport } from "./Report";
import type { InvestigationContext, CheckStatus, Report, OverallResult } from "./Inspection.type";
export interface VerificationCheck {
  id: string;
  status: CheckStatus;
  reason: string;
  optional?: boolean;
  difference?: {
    firstDifference: string | null;
    maxNumericDelta: ValueComparison["maxNumericDelta"];
    count: number;
  };
}
export interface VerificationData {
  checks: VerificationCheck[];
  provenance: StageProvenance[];
  build: "same" | "different" | "unknown";
  numericTolerance: number;
  automaticDifferenceCount: number;
  savedNoteCount: number | null;
  replayNoteCount: number | null;
  automaticNoteCount: number | null;
  portableProjectionDifferenceCount: number;
}
export function overallChecks(checks: VerificationCheck[]): OverallResult {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "mismatch")) return "mismatch";
  return checks.some((c) => c.status === "skipped" && !c.optional) ? "incomplete" : "pass";
}
function compared(id: string, difference: ValueComparison, invariant = false): VerificationCheck {
  return {
    id,
    status: difference.firstDifference ? (invariant ? "fail" : "mismatch") : "pass",
    reason: difference.firstDifference
      ? `First difference: ${difference.firstDifference}`
      : "Values agree within documented tolerance.",
    difference: {
      firstDifference: difference.firstDifference,
      maxNumericDelta: difference.maxNumericDelta,
      count: difference.differences.length,
    },
  };
}
export async function verifyPackage(
  context: InvestigationContext,
  options: { portable: boolean },
): Promise<Report<VerificationData>> {
  if (options.portable) throw new Error("Portable verification is not implemented yet.");
  const { input, identity } = context;
  const p = input.metadata;
  const checks: VerificationCheck[] = [
    {
      id: "package.integrity",
      status: "pass",
      reason:
        "Container and required metadata validated; schema-2 PCM SHA-256 checked by the shared reader.",
    },
  ];
  const { result, provenance } = await computeComparison(context);
  const edited = result.edited;
  let portableProjectionDifferenceCount = 0;
  let savedNoteCount: number | null = null,
    replayNoteCount: number | null = null,
    automaticNoteCount: number | null = null;
  if (p.schemaVersion === 2 && edited) {
    savedNoteCount = p.evidence.notes.length;
    replayNoteCount = edited.evidence.notes.length;
    automaticNoteCount = result.automatic?.evidence.notes.length ?? null;
    checks.push(
      compared(
        "replay.edited",
        compareValues(replayObservation(p), replayObservation(edited), "replay"),
      ),
    );
    const actualBytes = new Uint8Array(await (await encodeTuneMidi(edited.tune)).arrayBuffer());
    const byteDiff = compareValues(p.midiBytes, Array.from(actualBytes), "midiBytes");
    checks.push(compared("midi.bytes", byteDiff));
    const savedMusic = readTuneMidiMusic(Uint8Array.from(p.midiBytes));
    const actualMusic = readTuneMidiMusic(actualBytes);
    const sourceEvents = logicalPlaybackEvents(p.evidence.notes, p.tune);
    const portableEvents = tunePlaybackEvents(p.tune);
    portableProjectionDifferenceCount = compareValues(
      sourceEvents.events,
      savedMusic.events,
      "sourceToPortable.events",
    ).differences.length;
    const header = {
      program: PROGRAMS[p.tune.play.instrument],
      beatsPerBar: p.tune.beatsPerBar,
      microsecondsPerQuarter: p.evidence.settings.midi.microsecondsPerQuarter,
      ppq: p.evidence.settings.midi.ppq,
    };
    checks.push(
      compared(
        "midi.portable-replay",
        compareValues(
          { events: portableEvents.events, ...header },
          {
            events: savedMusic.events,
            program: savedMusic.program,
            beatsPerBar: savedMusic.beatsPerBar,
            microsecondsPerQuarter: savedMusic.microsecondsPerQuarter,
            ppq: savedMusic.ppq,
          },
          "savedMidi",
        ),
      ),
    );
    const timed = (music: typeof savedMusic) =>
      music.events.map(({ tick, ...event }) => ({
        ...event,
        timeSeconds: (tick * music.microsecondsPerQuarter) / music.ppq / 1e6,
      }));
    checks.push(
      compared(
        "musical.events",
        compareValues(timed(savedMusic), timed(actualMusic), "musicalEvents"),
      ),
    );
    const metadata = (music: typeof savedMusic) => ({
      program: music.program,
      beatsPerBar: music.beatsPerBar,
      microsecondsPerQuarter: music.microsecondsPerQuarter,
      ppq: music.ppq,
    });
    checks.push(
      compared(
        "midi.metadata",
        compareValues(metadata(savedMusic), metadata(actualMusic), "midiMetadata"),
      ),
    );
    checks.push({
      id: "automatic.intent",
      status: "pass",
      reason: `${result.automaticDifferences?.differences.length ?? 0} source correspondences differ from saved observations; explicit corrections are feedback, untouched notes are unapproved.`,
    });
  } else {
    for (const id of [
      "replay.edited",
      "midi.bytes",
      "musical.events",
      "midi.metadata",
      "automatic.intent",
    ])
      checks.push({
        id,
        status: "skipped",
        reason: "Capture-only WAV has no saved melody baseline.",
      });
  }
  const imports = await verifyImportModes(input);
  checks.push(
    p.schemaVersion === 2
      ? compared("import.restore", imports.restore, true)
      : {
          id: "import.restore",
          status: "skipped",
          reason: "Capture-only WAV cannot restore saved melody intent.",
        },
  );
  checks.push(compared("import.fresh", imports.fresh, true));
  const roundtrip = decodeWav(wavBytes(input.pcm, input.sampleRate));
  const identical =
    roundtrip.sampleRate === input.sampleRate &&
    roundtrip.pcm.length === input.pcm.length &&
    roundtrip.pcm.every((value, index) => value === input.pcm[index]);
  checks.push({
    id: "pcm.roundtrip",
    status: identical ? "pass" : "fail",
    reason: identical
      ? "Sample rate, count and decoded PCM samples preserved exactly."
      : "PCM round trip changed samples or format.",
  });
  const report = makeReport(
    "verify",
    identity,
    {
      checks,
      provenance,
      build: result.build,
      numericTolerance: NUMERIC_COMPARISON_TOLERANCE,
      automaticDifferenceCount: result.automaticDifferences?.differences.length ?? 0,
      savedNoteCount,
      replayNoteCount,
      automaticNoteCount,
      portableProjectionDifferenceCount,
    },
    overallChecks(checks),
  );
  if (portableProjectionDifferenceCount)
    report.findings.push({
      code: "portable.source-projection",
      severity: "info",
      message: `${portableProjectionDifferenceCount} event fields differ between full-resolution source notes and saved portable MIDI. Portable timing is a separate representation; current portable replay is checked independently.`,
      evidence: ["tune.noteSource", "evidence.notes", "midiBytes"],
    });
  report.execution = context.execution;
  report.scope = {
    total: checks.length,
    returned: checks.length,
    offset: 0,
    limit: 20,
    omitted: 0,
  };
  report.nextSteps = [
    {
      code: "inspect.summary",
      reason: "Return to the executive summary",
      argv: ["bin/diapason", "inspect", identity.path, "--format", "markdown"],
    },
  ];
  return report;
}
