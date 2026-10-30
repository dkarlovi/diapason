import { midiEvents } from "../Midi/Midi";
import { recordingFromPortableTune } from "../Tune/PortableTune";
import { recordingNotes } from "../Recording/Processing";
import type { NoteEvent } from "../Melody/Notes";
import type { PortableTune } from "../Tune/PortableTune.type";

export function logicalPlaybackEvents(
  notes: NoteEvent[],
  tune: Pick<PortableTune, "play" | "bpm" | "beatsPerBar">,
) {
  const rendered = notes
    .map((n) => ({ ...n, midi: n.midi + 12 * tune.play.octave }))
    .filter((n) => n.midi >= 0 && n.midi <= 127);
  return {
    notes: rendered,
    events: midiEvents(rendered, { bpm: tune.bpm }),
    bpm: tune.bpm,
    beatsPerBar: tune.beatsPerBar,
    instrument: tune.play.instrument,
    octave: tune.play.octave,
  };
}
export function tunePlaybackEvents(tune: PortableTune) {
  return logicalPlaybackEvents(
    recordingNotes(recordingFromPortableTune(tune, "export", 0), []),
    tune,
  );
}
