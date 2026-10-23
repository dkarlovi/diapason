import { expect, it } from "vitest";
import { initialSetup, setupReducer, nextSetupStep, canRecord } from "./recording-setup";
const pass = { pass: true, checks: [] };
it("unlocks in order and retains successful checks until their dependencies change", () => {
  let s = initialSetup;
  expect(nextSetupStep(s)).toBe("sound");
  s = setupReducer(s, { type: "source", id: "whistle" });
  expect(nextSetupStep(s)).toBe("microphone");
  s = setupReducer(s, { type: "microphone", ready: true });
  s = setupReducer(s, { type: "room-start" });
  s = setupReducer(s, {
    type: "room-result",
    revision: s.revision,
    result: { ...pass, floor: 0.001, gate: 0.003 },
  });
  expect(nextSetupStep(s)).toBe("sound-check");
  s = setupReducer(s, { type: "sound-start" });
  s = setupReducer(s, { type: "sound-result", revision: s.revision, result: pass });
  expect(nextSetupStep(s)).toBe("tempo");
  s = setupReducer(s, { type: "tempo", bpm: 90, beatsPerBar: 4 });
  s = setupReducer(s, { type: "tempo-confirm" });
  expect(canRecord(s)).toBe(true);
  expect(setupReducer(s, { type: "gain", value: 1 })).toEqual(s);
  const changed = setupReducer(s, { type: "gain", value: 2 });
  expect(nextSetupStep(changed)).toBe("room");
  expect(changed.tempoConfirmed).toBe(true);
  expect(canRecord(changed)).toBe(false);
  expect(
    setupReducer(changed, {
      type: "room-result",
      revision: s.revision,
      result: { ...pass, floor: 0.001, gate: 0.003 },
    }),
  ).toEqual(changed);
  expect(setupReducer(s, { type: "room-start" }).sound).toBeNull();
  expect(setupReducer(s, { type: "device", id: "other" }).soundConfirmed).toBe(true);
  expect(setupReducer(s, { type: "tempo", bpm: 120, beatsPerBar: 3 }).tempoConfirmed).toBe(false);
  expect(canRecord(setupReducer(s, { type: "busy", value: true }))).toBe(false);
});
it("does not accept failed, unstarted, invalid tempo, or obsolete results", () => {
  expect(
    setupReducer(initialSetup, {
      type: "room-result",
      revision: 0,
      result: { ...pass, floor: 0, gate: 0.003 },
    }).room,
  ).toBeNull();
  let s = setupReducer(initialSetup, { type: "sound-start" });
  s = setupReducer(s, {
    type: "sound-result",
    revision: s.revision,
    result: { ...pass, pass: false },
  });
  expect(s.sound?.pass).toBe(false);
  s = setupReducer(s, { type: "tempo", bpm: NaN, beatsPerBar: 4 });
  expect(setupReducer(s, { type: "tempo-confirm" }).tempoConfirmed).toBe(false);
});
