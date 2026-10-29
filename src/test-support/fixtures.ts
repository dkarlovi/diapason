import { readFileSync } from "node:fs";
import { decodeWav } from "../wav-reader";
import { analyzeRecording } from "../recording-analysis";
import { recording } from "./recording";

export function loadFixture(
  name: "whistle-regression" | "whistle-take2" | "whistle-intro",
  durationSec?: number,
) {
  const bytes = readFileSync(new URL(`../fixtures/${name}/original.wav`, import.meta.url));
  const { pcm: sourcePcm, sampleRate } = decodeWav(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const pcm =
    durationSec === undefined
      ? sourcePcm
      : sourcePcm.slice(0, Math.round(durationSec * sampleRate));
  const manifest = JSON.parse(
    readFileSync(new URL(`../fixtures/${name}/manifest.json`, import.meta.url), "utf8"),
  ) as { bpm?: number };
  const record = recording({
    sampleRate,
    durationSec: pcm.length / sampleRate,
    bpm: manifest.bpm ?? 95,
  });
  return { pcm, sampleRate, record, frames: analyzeRecording(pcm, sampleRate, record) };
}
