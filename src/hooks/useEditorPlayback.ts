import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlaySettings } from "../instruments";
import type { Recording } from "../db";
import type { NoteEvent } from "../notes";
import { playPcm, playNotes, type Playback } from "../playback";
import { onOutputChange, activeOutput } from "../midiout";
import { createPlayheadStore } from "../playhead-store";

interface Options {
  recordingId: string;
  recordRef: RefObject<Recording | null>;
  pcmRef: RefObject<Float32Array>;
  notes: NoteEvent[];
}

export function useEditorPlayback({ recordingId, recordRef, pcmRef, notes }: Options) {
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
    }
  }, [playhead]);

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
    },
    [recordRef, start, stopPlayback],
  );
  const togglePlayback = useCallback(
    (kind: "audio" | "midi") => {
      const current = recordRef.current;
      const wasThis = transport.current.kind === kind;
      stopPlayback();
      if (!current || wasThis) return;
      start(
        kind,
        kind === "audio"
          ? playPcm(pcmRef.current, current.sampleRate)
          : playNotes(notes, current.durationSec, current.play),
      );
    },
    [notes, stopPlayback, recordRef, pcmRef, start],
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
