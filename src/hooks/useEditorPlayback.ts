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
  const [position, setPosition] = useState<number | null>(null);
  const [externalOutput, setExternalOutput] = useState(() => !!activeOutput());
  const playback = useRef<Playback | null>(null);
  const preview = useRef<Playback | null>(null);
  const raf = useRef(0);
  const mounted = useRef(false);
  const playingRef = useRef<"audio" | "midi" | null>(null);

  const stopPlayback = useCallback(() => {
    playback.current?.stop();
    playback.current = null;
    playingRef.current = null;
    cancelAnimationFrame(raf.current);
    if (mounted.current) {
      setPlaying(null);
      setPosition(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setPlaying(null);
    setPosition(null);
    return () => {
      mounted.current = false;
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
      preview.current?.stop();
      preview.current = playNotes([{ ...note, start: 0 }], note.duration, current.play);
    },
    [recordRef],
  );

  const togglePlayback = useCallback(
    (kind: "audio" | "midi") => {
      const current = recordRef.current;
      const wasThis = playingRef.current === kind;
      stopPlayback();
      if (!current || wasThis) return;
      playback.current =
        kind === "audio"
          ? playPcm(pcmRef.current, current.sampleRate)
          : playNotes(notes, current.durationSec, current.play);
      playingRef.current = kind;
      setPlaying(kind);
      const active = playback.current;
      const tick = () => {
        if (playback.current !== active) return;
        const value = playback.current?.position();
        if (value == null) {
          stopPlayback();
          return;
        }
        setPosition(value);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [notes, stopPlayback, recordRef, pcmRef],
  );

  return { playing, position, externalOutput, togglePlayback, previewNote, stopPlayback };
}
