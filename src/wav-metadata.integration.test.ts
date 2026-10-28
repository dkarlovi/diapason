// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeAudio } from "./codec";
import type { AudioRecording as Recording } from "./db";
import { notesToMidi } from "./midi";
import { analyzeRecording } from "./recording-analysis";
import { recordingNotes } from "./recording";
import { loadFixture } from "./test-support/fixtures";
import { encodeTaggedWav, recordingFromTaggedWav } from "./wav-metadata";

const url = (file: string) => new URL(`./fixtures/whistle-intro/${file}`, import.meta.url);
const intro = loadFixture("whistle-intro");

it("whistle-intro exports and re-imports to the approved Clean MIDI", async () => {
  // The saved take was edited (a Syncopated preset); the WAV must carry none of that.
  const { saved } = JSON.parse(readFileSync(url("original.json"), "utf8")) as {
    saved: Omit<Recording, "audio">;
  };
  const record: Recording = { ...saved, audio: new Blob() };
  const context = { browser: "Firefox", audioOutput: "unknown", midiOutput: "Browser synth" };
  const tagged = encodeTaggedWav(record, intro.pcm, context);

  const imported = await recordingFromTaggedWav(await tagged.arrayBuffer(), "intro.wav");
  const pcm = await decodeAudio(imported.audio);
  const frames = analyzeRecording(pcm, imported.sampleRate, imported);
  const midi = await notesToMidi(recordingNotes(imported, frames), {
    bpm: imported.bpm,
  }).arrayBuffer();

  expect(imported.id).toBe("mvl403tu-z13urb");
  expect(imported.bpm).toBe(94);
  expect(new Uint8Array(midi)).toEqual(new Uint8Array(readFileSync(url("clean.mid"))));
}, 60_000);
