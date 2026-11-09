import type { Frame } from "../../src/Melody/Notes";
import type { ContourPart } from "./contours.type";

function contourPitch(part: ContourPart, index: number, time: number): number | null {
  switch (part.kind) {
    case "hold":
      return part.midi;
    case "linear":
      return part.from + ((part.to - part.from) * index) / Math.max(1, part.frames - 1);
    case "vibrato":
      return part.midi + part.amplitude * Math.sin(2 * Math.PI * part.hz * time);
    case "silence":
      return null;
  }
}

export function contourFrames(parts: readonly ContourPart[]): Frame[] {
  const frames: Frame[] = [];
  for (const part of parts)
    for (let i = 0; i < part.frames; i++) {
      const t = (frames.length * 512) / 48000;
      const pitch = contourPitch(part, i, t);
      frames.push({
        t,
        freq: pitch === null ? null : 440 * 2 ** ((pitch - 69) / 12),
        clarity: pitch === null ? 0 : 0.99,
        rms: pitch === null ? 0 : (part.rms ?? 0.1),
      });
    }
  return frames;
}
