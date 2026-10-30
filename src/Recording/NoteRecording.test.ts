import { expect, it } from "vitest";
import "fake-indexeddb/auto";
import { isAudioRecording } from "./Recording.storage";
import { getRecording, putRecording } from "./Recording.storage";
import { processRecording } from "./Processing";
import { noteRecording } from "../../tests/support/note-recording";
const fixed = noteRecording();
it("reloads a durable tune with edited notes and no audio or analysis cache", async () => {
  const record = {
    ...fixed,
    noteEdits: {
      version: 1 as const,
      pitch: [{ id: "correction", ranges: [{ start: 0, end: 0.5 }], midi: 75 }],
    },
    muted: [{ t: 0.75, midi: 74 }],
  };
  await putRecording(record);
  const loaded = (await getRecording(record.id))!;
  expect(isAudioRecording(loaded)).toBe(false);
  expect(loaded.audio).toBeUndefined();
  expect(loaded.play).toEqual({ instrument: "flute", octave: -2 });
  const result = processRecording(loaded, []);
  expect(result.notes.map((n) => n.midi)).toEqual([75]);
  expect(result.items[0]!.editState.axes).toEqual(["pitch"]);
  delete loaded.noteEdits;
  loaded.muted = [];
  expect(processRecording(loaded, []).notes.map((n) => n.midi)).toEqual([72, 74]);
});
it("keeps fixed-note mutes through musical pitch changes", () => {
  const record = noteRecording();
  record.muted = [{ t: 0.25, midi: 20 }];
  expect(processRecording(record, []).items[0]!.muted).toBe(true);
});
it("rejects incomplete fixed source context", async () => {
  const { validateNoteSource } = await import("./NoteSource");
  const source = noteRecording().noteSource;
  expect(() => validateNoteSource({ ...source, frozenDetection: {} }, 2)).toThrow();
});
