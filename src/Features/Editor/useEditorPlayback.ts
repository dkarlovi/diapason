import { useNotice } from "../../UI/useNotice";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlaySettings } from "../../Playback/Instruments";
import type { Recording } from "../../Recording/Recording.type";
import type { NoteEvent } from "../../Melody/Notes";
import { playPcm, playNotes } from "../../Playback/Playback";
import { onOutputChange, activeOutput } from "../../Midi/MidiOutput";
import { createPlayheadStore } from "../../Playback/Playhead.store";
import type { Playback } from "../../Playback/Playback.type";

interface Options {
  recordingId: string;
  recordRef: RefObject<Recording | null>;
  pcmRef: RefObject<Float32Array>;
  notes: NoteEvent[];
}

export function useEditorPlayback({ recordingId, recordRef, pcmRef, notes }: Options) {
  const [notice, setNotice] = useNotice();
  const dismissNotice = useCallback(() => setNotice(null), [setNotice]);
  const [playing, setPlaying] = useState<"audio" | "midi" | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [playhead] = useState(createPlayheadStore);
  const [externalOutput, setExternalOutput] = useState(() => !!activeOutput());
  const playback = useRef<Playback | null>(null);
  const transport = useRef({
    raf: 0,
    mounted: false,
    kind: null as "audio" | "midi" | null,
    previewId: null as string | null,
  });

  const stopPlayback = useCallback(() => {
    playback.current?.stop();
    playback.current = null;
    transport.current.previewId = null;
    transport.current.kind = null;
    cancelAnimationFrame(transport.current.raf);
    playhead.getState().set(null);
    if (transport.current.mounted) {
      setPlaying(null);
      setPreviewId(null);
      setNotice((current) => (current?.kind === "info" ? null : current));
    }
  }, [playhead, setNotice]);

  useEffect(() => {
    transport.current.mounted = true;
    setPlaying(null);
    playhead.getState().set(null);
    setPreviewId(null);
    return () => {
      transport.current.mounted = false;
      stopPlayback();
    };
  }, [recordingId, playhead, stopPlayback]);

  useEffect(
    () =>
      onOutputChange(() => {
        stopPlayback();
        setExternalOutput(!!activeOutput());
      }),
    [stopPlayback],
  );

  const start = useCallback(
    (kind: "audio" | "midi", handle: Playback, offset = 0) => {
      playback.current = handle;
      transport.current.kind = kind;
      setPlaying(kind);
      const tick = () => {
        if (playback.current !== handle) return;
        const value = handle.position();
        if (value == null) {
          stopPlayback();
          return;
        }
        playhead.getState().set(value + offset);
        transport.current.raf = requestAnimationFrame(tick);
      };
      transport.current.raf = requestAnimationFrame(tick);
    },
    [playhead, stopPlayback],
  );
  const previewNote = useCallback(
    (note: NoteEvent) => {
      const current = recordRef.current;
      if (!current) return;
      stopPlayback();
      start("midi", playNotes([{ ...note, start: 0 }], note.duration, current.play), note.start);
      setNotice({ kind: "info", message: `Playing note ${note.name}` });
    },
    [recordRef, start, stopPlayback, setNotice],
  );
  const togglePlayback = useCallback(
    (kind: "audio" | "midi") => {
      const current = recordRef.current;
      const wasThis = transport.current.kind === kind;
      stopPlayback();
      if (!current || wasThis || (kind === "audio" && current.noteSource)) return;
      try {
        start(
          kind,
          kind === "audio" && !current.noteSource
            ? playPcm(pcmRef.current, current.sampleRate)
            : playNotes(notes, current.durationSec, current.play),
        );
        setNotice({
          kind: "info",
          message: kind === "audio" ? "Playing original audio" : "Playing MIDI melody",
        });
      } catch (error) {
        setNotice({ kind: "error", message: `Playback failed: ${(error as Error).message}` });
      }
    },
    [notes, stopPlayback, recordRef, pcmRef, start, setNotice],
  );
  const previewSequence = useCallback(
    (notes: NoteEvent[], id: string, duration?: number, offset = 0, play?: PlaySettings) => {
      const current = recordRef.current;
      const wasThis = transport.current.previewId === id;
      stopPlayback();
      if (!current || wasThis) return;
      start(
        "midi",
        playNotes(notes, duration ?? current.durationSec, play ?? current.play),
        offset,
      );
      transport.current.previewId = id;
      setPreviewId(id);
    },
    [recordRef, start, stopPlayback],
  );

  return {
    notice,
    showNotice: setNotice,
    dismissNotice,
    playing,
    playhead,
    externalOutput,
    togglePlayback,
    previewNote,
    stopPlayback,
    previewSequence,
    previewId,
  };
}
