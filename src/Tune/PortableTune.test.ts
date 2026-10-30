// @vitest-environment node
import { expect, it } from "vitest";
import { noteRecording } from "../../tests/support/note-recording";
import { INSTRUMENTS } from "../Playback/Instruments";
import { createPortableTune, recordingFromPortableTune } from "./PortableTune";
import { encodeTune, decodeTune } from "./Tune.codec";
import { processRecording } from "../Recording/Processing";
import { loadFixture } from "../../tests/support/fixtures";
import { resolveKnobs } from "../Melody/Knobs";

it("shares a fractional Context correction value on Clean using v2", async () => {
  const record = noteRecording();
  record.melody = {
    preset: "clean",
    key: "auto",
    overrides: { ...record.noteSource.frozenDetection, contextCorrection: 0.37 },
  };
  const tune = createPortableTune(record, []);
  const bytes = await encodeTune(tune);
  expect(bytes[5]).toBe(2);
  const decoded = await decodeTune(bytes);
  expect(decoded.melody.overrides).toEqual(record.melody.overrides);
  expect(decoded.effectiveKnobs.contextCorrection).toBe(0.37);
  expect(processRecording(recordingFromPortableTune(decoded, "context", 0), []).notes).toEqual(
    processRecording(record, []).notes,
  );
});

it("versions identical effective controls consistently regardless of their base preset", () => {
  const controls = { ...resolveKnobs("auto-tune", {}), contextCorrection: 1 };
  for (const preset of ["clean", "auto-tune", "keep-odd"] as const) {
    const record = noteRecording();
    record.melody = {
      preset,
      key: "auto",
      overrides: { ...controls, ...record.noteSource.frozenDetection },
    };
    expect(createPortableTune(record, []).noteSource.interpretationVersion).toBe(2);
  }
});

it("retains an explicit zero control override even on Auto tune, without reactivating correction on import", async () => {
  const record = noteRecording();
  record.melody = {
    preset: "auto-tune",
    key: "auto",
    overrides: { ...record.noteSource.frozenDetection, contextCorrection: 0 },
  };
  const decoded = await decodeTune(await encodeTune(createPortableTune(record, [])));
  expect(decoded.effectiveKnobs.contextCorrection).toBe(0);
  expect(decoded.melody.overrides).toEqual(record.melody.overrides);
});
it("round-trips Auto tune with interpretation v2, fixed notes, edits, mutes and sound", async () => {
  const take = loadFixture("whistle-intro");
  const record = {
    ...take.record,
    melody: { preset: "auto-tune" as const, key: "auto" as const, overrides: { grid: 2 as const } },
    play: { instrument: "flute" as const, octave: -1 },
  };
  const original = processRecording(record, take.frames);
  const edited = {
    ...record,
    noteEdits: {
      version: 1 as const,
      pitch: [{ id: "chosen", ranges: [original.items[0]!.source], midi: 86 }],
    },
    muted: [{ t: original.items[1]!.raw.start + 0.1, midi: original.items[1]!.raw.midi }],
  };
  const tune = createPortableTune(edited, take.frames);
  expect(tune.noteSource.interpretationVersion).toBe(2);
  const bytes = await encodeTune(tune);
  expect(bytes[5]).toBe(2);
  const decoded = await decodeTune(bytes);
  expect(decoded.melody).toEqual(record.melody);
  expect(decoded.play).toEqual(record.play);
  const restored = processRecording(recordingFromPortableTune(decoded, "auto", 0), []);
  expect(restored.notes).toEqual(processRecording(edited, take.frames).notes);
  expect(restored.items[0]!.note.midi).toBe(86);
  expect(restored.items[1]!.muted).toBe(true);
  const { encodeTuneMidi, decodeTuneMidi } = await import("../Midi/TuneMidi");
  const fromMidi = await decodeTuneMidi(
    new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer()),
  );
  expect(processRecording(recordingFromPortableTune(fromMidi, "midi", 0), []).notes).toEqual(
    restored.notes,
  );
  const wrongVersion = bytes.slice();
  wrongVersion[5] = 1;
  await expect(decodeTune(wrongVersion)).rejects.toThrow();
}, 15000);

it("keeps legacy preset interpretation v1 when sharing and rejects unknown interpretation versions", async () => {
  const tune = createPortableTune(noteRecording(), []);
  const bytes = await encodeTune(tune);
  expect(bytes[5]).toBe(1);
  const decoded = await decodeTune(bytes);
  expect(decoded.noteSource.interpretationVersion).toBe(1);
  expect(await encodeTune(decoded)).toEqual(bytes);
  const future = bytes.slice();
  future[5] = 255;
  await expect(decodeTune(future)).rejects.toThrow(/Unsupported/);
});
it("carries edits, mutes, sound and visible settings without sender history", async () => {
  const record = noteRecording();
  record.noteEdits = {
    version: 1,
    pitch: [{ id: "edit", ranges: [{ start: 0, end: 0.5 }], midi: 75 }],
  };
  record.muted = [{ t: 0.75, midi: 74 }];
  record.editHead = { commitId: "private", revision: 5 };
  const tune = createPortableTune(record, []);
  const decoded = await decodeTune(await encodeTune(tune));
  const imported = recordingFromPortableTune(decoded, "friend", 123);
  expect(imported.play).toEqual({ instrument: "flute", octave: -2 });
  expect(imported.melody).toEqual(record.melody);
  expect(imported.audio).toBeUndefined();
  expect(imported.editHead).toBeUndefined();
  const result = processRecording(imported, []);
  expect(result.notes.map((n) => n.midi)).toEqual([75]);
  expect(result.items[0]!.editState.axes).toEqual(["pitch"]);
  expect(result.items[1]!.muted).toBe(true);
  delete imported.noteEdits;
  expect(processRecording(imported, []).notes.map((n) => n.midi)).toEqual([72]);
});
it.each(INSTRUMENTS)("retains $id at every playback octave", async ({ id }) => {
  for (const octave of [1, 0, -1, -2, -3]) {
    const record = noteRecording();
    record.play = { instrument: id, octave };
    expect((await decodeTune(await encodeTune(createPortableTune(record, [])))).play).toEqual(
      record.play,
    );
  }
});
it("keeps fixture pitches and timing stable across repeated sharing", async () => {
  const take = loadFixture("whistle-intro");
  const original = processRecording(take.record, take.frames);
  let tune = createPortableTune(take.record, take.frames);
  const once = await encodeTune(tune);
  for (let i = 0; i < 3; i++) tune = await decodeTune(await encodeTune(tune));
  expect(await encodeTune(tune)).toEqual(once);
  const imported = processRecording(recordingFromPortableTune(tune, "friend", 1), []);
  expect(imported.notes.map((n) => n.midi)).toEqual(original.notes.map((n) => n.midi));
  imported.notes.forEach((n, i) =>
    expect(Math.abs(n.start - original.notes[i]!.start)).toBeLessThan(0.002),
  );
  expect(once.length).toBeLessThan(JSON.stringify(tune).length / 2);
}, 30_000);
it("rejects truncated, trailing and unsupported data", async () => {
  const bytes = await encodeTune(createPortableTune(noteRecording(), []));
  await expect(decodeTune(bytes.slice(0, 5))).rejects.toThrow();
  await expect(decodeTune(Uint8Array.from([...bytes, 123]))).rejects.toThrow();
  const newer = bytes.slice();
  newer[4] = 255;
  await expect(decodeTune(newer)).rejects.toThrow();
});
it("preserves tuning ties through the actual binary payload and its own MIDI", async () => {
  const record = noteRecording();
  record.durationSec = 2.6;
  const boundaries = [0, 0.5, 1.5, 2.2, 2.4, 2.6];
  const pitches = [65.5, 67, 70.5, 60.49999999999999, 71.5];
  record.noteSource.segments = pitches.map((pitch, i) => ({
    start: boundaries[i]!,
    duration: boundaries[i + 1]! - boundaries[i]!,
    pitch,
    source: { start: boundaries[i]!, end: boundaries[i + 1]! },
  }));
  const expected = [66, 67, 71, 61, 72];
  expect(processRecording(record, []).notes.map((n) => n.midi)).toEqual(expected);
  const tune = createPortableTune(record, []);
  const decoded = await decodeTune(await encodeTune(tune));
  expect(
    processRecording(recordingFromPortableTune(decoded, "tie", 0), []).notes.map((n) => n.midi),
  ).toEqual(expected);
  const { encodeTuneMidi, decodeTuneMidi } = await import("../Midi/TuneMidi");
  const midi = await encodeTuneMidi(tune);
  const fromMidi = await decodeTuneMidi(new Uint8Array(await midi.arrayBuffer()));
  expect(
    processRecording(recordingFromPortableTune(fromMidi, "tie-midi", 0), []).notes.map(
      (n) => n.midi,
    ),
  ).toEqual(expected);
});
it("rejects source coverage beyond the declared duration before offering an edited tune", async () => {
  const tune = createPortableTune(noteRecording(), []);
  tune.noteSource.segments[1]!.source.end = 1.0005;
  tune.noteSource.segments[1]!.duration = 0.5005;
  tune.pitchEdits = [{ noteIndex: 1, midi: 75 }];
  const { packTune } = await import("./TuneFields");
  const raw = packTune(tune);
  // Name is six UTF-8 bytes; replace the following duration varint 2000 with 1000.
  raw[7] = 232;
  raw[8] = 7;
  await expect(decodeTune(Uint8Array.from([68, 80, 83, 78, 1, 1, 0, ...raw]))).rejects.toThrow();
  tune.durationMs = 1000;
  await expect(encodeTune(tune)).rejects.toThrow();
});
