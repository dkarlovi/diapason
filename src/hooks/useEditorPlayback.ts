import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Recording } from "../db";
import type { NoteEvent } from "../notes";
import { playPcm, playNotes, type Playback } from "../playback";
import { onOutputChange, activeOutput } from "../midiout";

interface Options {
  recordingId: string;
  recordRef: RefObject<Recording | null>;
  pcmRef: RefObject<Float32Array>;
  notes: NoteEvent[];
}

export function useEditorPlayback({ recordingId, recordRef, pcmRef, notes }: Options) {
  const [playing, setPlaying] = useState<"audio" | "midi" | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [externalOutput, setExternalOutput] = useState(() => !!activeOutput());
  const playback = useRef<Playback | null>(null);
  const preview = useRef<Playback | null>(null);
  const transport = useRef({
    raf: 0,
    mounted: false,
    kind: null as "audio" | "midi" | null,
    previewId: null as string | null,
  });

  const stopPlayback = useCallback(() => {
    preview.current?.stop();
    preview.current = null;
    playback.current?.stop();
    playback.current = null;
    transport.current.previewId = null;
    transport.current.kind = null;
    cancelAnimationFrame(transport.current.raf);
    if (transport.current.mounted) {
      setPlaying(null);
      setPreviewId(null);
      setPosition(null);
    }
  }, []);

  useEffect(() => {
    transport.current.mounted = true;
    setPlaying(null);
    setPosition(null);
    setPreviewId(null);
    return () => {
      transport.current.mounted = false;
      stopPlayback();
      preview.current?.stop();
      preview.current = null;
    };
  }, [recordingId, stopPlayback]);

  useEffect(
    () =>
      onOutputChange(() => {
        stopPlayback();
        setExternalOutput(!!activeOutput());
      }),
    [stopPlayback],
  );

  const previewNote = useCallback(
    (note: NoteEvent) => {
      const current = recordRef.current;
      if (!current) return;
      stopPlayback();
      preview.current?.stop();
      preview.current = playNotes([{ ...note, start: 0 }], note.duration, current.play);
    },
    [recordRef, stopPlayback],
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
        setPosition(value + offset);
        transport.current.raf = requestAnimationFrame(tick);
      };
      transport.current.raf = requestAnimationFrame(tick);
    },
    [stopPlayback],
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
    (notes: NoteEvent[], id: string, duration?: number, offset = 0) => {
      const current = recordRef.current;
      const wasThis = transport.current.previewId === id;
      stopPlayback();
      if (!current || wasThis) return;
      start("midi", playNotes(notes, duration ?? current.durationSec, current.play), offset);
      transport.current.previewId = id;
      setPreviewId(id);
    },
    [recordRef, start, stopPlayback],
  );

  return {
    playing,
    position,
    externalOutput,
    togglePlayback,
    previewNote,
    stopPlayback,
    previewSequence,
    previewId,
  };
}
