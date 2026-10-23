import { expect, it } from "vitest";
import { freqToMidi, midiToName } from "./notes";
it("maps standard tuning frequencies to MIDI", () => {
  expect(freqToMidi(440)).toBe(69);
  expect(freqToMidi(220)).toBe(57);
  expect(freqToMidi(261.6255653)).toBeCloseTo(60, 6);
});
it("names rounded MIDI pitches including octave boundaries", () => {
  expect(midiToName(69)).toBe("A4");
  expect(midiToName(59.6)).toBe("C4");
  expect(midiToName(0)).toBe("C-1");
});
