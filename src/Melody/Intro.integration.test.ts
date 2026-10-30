// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadFixture } from "../../tests/support/fixtures";
import { midiEvents, notesToMidi } from "../Midi/Midi";
import { midiToName } from "./Notes";
import { previewNotes } from "../Recording/Processing";
const intro = loadFixture("whistle-intro");
const beat = 60 / intro.record.bpm;
// Two held notes, then a four-note figure stepping down through E-flat major.
// The take is whistled about a quarter-tone sharp and lags the click by about a
// third of a beat; neither may leak into the result.
const intended: [string, number, number][] = [
  ["D#6", 0, 2],
  ["G6", 2, 2],
  ["G#6", 4, 1],
  ["F6", 5, 0.5],
  ["D#6", 5.5, 0.5],
  ["F6", 6, 0.5],
  ["G6", 8, 1],
  ["D#6", 9, 0.5],
  ["D6", 9.5, 0.5],
  ["D#6", 10, 0.5],
  ["F6", 12, 1],
  ["D6", 13, 0.5],
  ["C6", 13.5, 0.5],
  ["D6", 14, 0.5],
];
it("Clean transcribes the intro exactly, on the eighth-note grid", () => {
  const notes = previewNotes(intro.record, intro.frames, { preset: "clean", overrides: {} });
  expect(notes.map((note) => [note.name, note.start / beat, note.duration / beat])).toEqual(
    intended.map(([name, start, length]) => [
      name,
      expect.closeTo(start, 6),
      expect.closeTo(length, 6),
    ]),
  );
});
it("Clean exports the approved intro MIDI byte for byte", async () => {
  const url = (file: string) =>
    new URL(`../../tests/fixtures/whistle-intro/${file}`, import.meta.url);
  const approved = readFileSync(url("clean.mid"));
  const manifest = JSON.parse(readFileSync(url("manifest.json"), "utf8")) as {
    files: Record<string, string>;
  };
  expect(createHash("sha256").update(approved).digest("hex")).toBe(manifest.files["clean.mid"]);
  const notes = previewNotes(intro.record, intro.frames, { preset: "clean", overrides: {} });
  // Readable first, so a regression names the note that moved.
  const eighth = 480 / 2;
  expect(
    midiEvents(notes, { bpm: intro.record.bpm })
      .filter((event) => event.type === "on")
      .map((event) => [midiToName(event.midi), event.tick / eighth]),
  ).toEqual(intended.map(([name, start]) => [name, start * 2]));
  const exported = new Uint8Array(
    await notesToMidi(notes, { bpm: intro.record.bpm }).arrayBuffer(),
  );
  expect(exported).toEqual(new Uint8Array(approved));
});
it.each(["as-played", "gentle", "keep-odd"] as const)(
  "%s keeps each held intro note whole and every articulated note distinct",
  (preset) => {
    const notes = previewNotes(intro.record, intro.frames, { preset, overrides: {} });
    expect(notes.filter((note) => note.start < 1.48)).toHaveLength(1);
    expect(notes.filter((note) => note.start >= 1.48 && note.start < 2.74)).toHaveLength(1);
    expect(notes.length).toBeGreaterThanOrEqual(intended.length);
  },
);
it("Max pitch move keeps the intro's neighbour notes", () => {
  const notes = previewNotes(intro.record, intro.frames, {
    preset: "clean",
    overrides: { maxMoveSemitones: 2 },
  });
  expect(notes.map((note) => note.name)).toEqual(intended.map(([name]) => name));
});
