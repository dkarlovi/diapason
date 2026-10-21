// Frequency <-> MIDI note helpers, and segmentation of a frame stream into note events.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

/** Cents away from the nearest semitone (-50..+50), for the calibration stability meter. */
export function centsOff(freq: number): number {
  const midi = freqToMidi(freq);
  return Math.round((midi - Math.round(midi)) * 100);
}

/** A single captured analysis frame. `t` is seconds from capture start. */
export interface Frame {
  t: number;
  freq: number | null;
  clarity: number;
  rms: number;
}

/** A detected note event, ready for MIDI export. Times are in seconds. */
export interface NoteEvent {
  midi: number;
  name: string;
  start: number;
  duration: number;
}

export interface SegmentOptions {
  /** Low RMS floor just to drop dead air; voicing leans mainly on clarity. */
  rmsGate?: number;
  clarityThreshold?: number;
  /** Gap of unvoiced frames (s) that ends the current note. */
  silenceGapSec?: number;
  /** Notes shorter than this (s) are dropped as spurious. */
  minDurationSec?: number;
  medianWindow?: number;
  /** A different pitch must persist this long (s) before it splits the current note. */
  changeDebounceSec?: number;
  /** Extra semitones beyond ±0.5 the pitch must drift to leave a note (stickiness).
   *  0.4 ⇒ a locked note tolerates ±0.9 semitone of wobble/drift before it switches. */
  hysteresisSemitones?: number;
}

const SEGMENT_DEFAULTS: Required<SegmentOptions> = {
  rmsGate: 0.003,
  clarityThreshold: 0.9,
  silenceGapSec: 0.09,
  minDurationSec: 0.08,
  medianWindow: 5,
  changeDebounceSec: 0.06,
  hysteresisSemitones: 0.4,
};

// Heuristics (see README for limitations):
//  - voice on clarity + a low RMS floor (whistles stay clear even when quiet)
//  - median-filter the continuous pitch to tame frame-to-frame jitter
//  - STICKY note tracking: lock onto a note and only switch once the (smoothed) pitch
//    drifts more than ±(0.5 + hysteresis) semitones away, so a wandering held tone stays
//    one note instead of flip-flopping across a semitone boundary
//  - debounce the switch: the new note must also persist briefly
//  - label each note by the median pitch over its own frames (not the attack transient)
export function segmentNotes(frames: Frame[], opts: SegmentOptions = {}): NoteEvent[] {
  const cfg = { ...SEGMENT_DEFAULTS, ...opts };

  // 1. Continuous MIDI pitch per voiced frame (null = unvoiced).
  const pitch: (number | null)[] = frames.map((f) =>
    f.freq !== null && f.clarity >= cfg.clarityThreshold && f.rms >= cfg.rmsGate
      ? freqToMidi(f.freq)
      : null,
  );

  // 2. Median-filter the continuous pitch (ignoring nulls).
  const half = Math.floor(cfg.medianWindow / 2);
  const smooth: (number | null)[] = pitch.map((v, i) => {
    if (v === null) return null;
    const win: number[] = [];
    for (let j = i - half; j <= i + half; j++) {
      const s = pitch[j];
      if (j >= 0 && j < pitch.length && s !== null && s !== undefined) win.push(s);
    }
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)]!;
  });

  // 3. Sticky semitone labels via hysteresis. `lock` only moves when the pitch escapes
  //    the deadband; silence resets it so the next note locks fresh.
  const band = 0.5 + cfg.hysteresisSemitones;
  const labels: (number | null)[] = [];
  let lock: number | null = null;
  for (const p of smooth) {
    if (p === null) {
      labels.push(null);
      lock = null;
      continue;
    }
    if (lock === null || Math.abs(p - lock) > band) lock = Math.round(p);
    labels.push(lock);
  }

  // 4. Debounced state machine over the labels; note pitch = median of its frames.
  const events: NoteEvent[] = [];
  const median = (lo: number, hi: number): number => {
    const vals: number[] = [];
    for (let j = lo; j < hi; j++) {
      const s = smooth[j];
      if (s !== null && s !== undefined) vals.push(s);
    }
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)]!;
  };

  let cur: { label: number; start: number; lastT: number; si: number } | null = null;
  let cand: { label: number; start: number; si: number } | null = null;

  const close = (endIdx: number, endT: number): void => {
    if (cur && endT - cur.start >= cfg.minDurationSec) {
      const midi = Math.round(median(cur.si, endIdx));
      events.push({ midi, name: midiToName(midi), start: cur.start, duration: endT - cur.start });
    }
    cur = null;
  };

  for (let i = 0; i < frames.length; i++) {
    const t = frames[i]!.t;
    const L = labels[i];

    if (L === null || L === undefined) {
      if (cur && t - cur.lastT >= cfg.silenceGapSec) {
        close(i, cur.lastT);
        cand = null;
      }
      continue;
    }

    if (!cur) {
      cur = { label: L, start: t, lastT: t, si: i };
      cand = null;
    } else if (L === cur.label) {
      cur.lastT = t;
      cand = null;
    } else {
      if (!cand || cand.label !== L) cand = { label: L, start: t, si: i };
      if (t - cand.start >= cfg.changeDebounceSec) {
        close(cand.si, cand.start);
        cur = { label: L, start: cand.start, lastT: t, si: cand.si };
        cand = null;
      } else {
        cur.lastT = t;
      }
    }
  }
  if (cur) close(frames.length, (cur as { lastT: number }).lastT);

  // 5. Merge consecutive events of the same pitch with no real gap between them
  //    (a glide relabel can split one held note into two same-pitch events). A genuine
  //    re-articulation of the same note leaves a silence gap and is preserved.
  const merged: NoteEvent[] = [];
  for (const e of events) {
    const prev = merged[merged.length - 1];
    if (prev && prev.midi === e.midi && e.start - (prev.start + prev.duration) < cfg.silenceGapSec) {
      prev.duration = e.start + e.duration - prev.start;
    } else {
      merged.push({ ...e });
    }
  }

  return merged;
}
