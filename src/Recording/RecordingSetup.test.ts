import { expect, it } from "vitest";
import {
  initialSetup,
  setupReducer,
  nextSetupStep,
  canRecord,
  effectiveAnalysis,
  type SetupState,
} from "./RecordingSetup";
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

function voiceSetup(): SetupState {
  return {
    ...initialSetup,
    profileId: "voice-experimental",
    soundConfirmed: true,
    micReady: true,
    room: { ...pass, floor: 0.001, gate: 0.003 },
  };
}
function endpoint(state: ReturnType<typeof voiceSetup>, target: "low" | "high", frequency: number) {
  const measuring = setupReducer(state, { type: "endpoint-start", target });
  return setupReducer(measuring, {
    type: "endpoint-result",
    target,
    revision: measuring.revision,
    result: { ...pass, frequency },
  });
}
it("requires both endpoints before installing a preferred range", () => {
  const low = endpoint(voiceSetup(), "low", 130);
  expect(nextSetupStep(low)).toBe("sound-check");
  expect(effectiveAnalysis(low).preferredRange).toBeUndefined();
  const ready = endpoint(low, "high", 440);
  expect(nextSetupStep(ready)).toBe("tempo");
  expect(effectiveAnalysis(ready).preferredRange?.minFreq).toBeCloseTo(109.3165, 3);
  const retry = setupReducer(ready, { type: "endpoint-start", target: "low" });
  expect(effectiveAnalysis(retry).preferredRange).toBeUndefined();
  expect(retry.voice.high?.frequency).toBe(440);
});
it("rejects reversed endpoints and obsolete results", () => {
  const ready = endpoint(endpoint(voiceSetup(), "low", 440), "high", 130);
  expect(ready.sound?.pass).toBe(false);
  expect(effectiveAnalysis(ready).preferredRange).toBeUndefined();
  const started = setupReducer(ready, { type: "endpoint-start", target: "high" });
  expect(
    setupReducer(started, { type: "sound-result", revision: started.revision, result: pass }),
  ).toEqual(started);
  expect(
    setupReducer(started, {
      type: "endpoint-result",
      target: "low",
      revision: started.revision,
      result: { ...pass, frequency: 130 },
    }),
  ).toEqual(started);
  const cancelled = setupReducer(started, { type: "cancel" });
  expect(
    setupReducer(cancelled, {
      type: "endpoint-result",
      target: "high",
      revision: started.revision,
      result: { ...pass, frequency: 600 },
    }),
  ).toEqual(cancelled);
});
it("invalidates a voice range on input and room edits but keeps it on tempo edits", () => {
  const ready = endpoint(endpoint(voiceSetup(), "low", 130), "high", 440);
  for (const action of [
    { type: "gain", value: 2 },
    { type: "device", id: "other" },
    { type: "room-start" },
    { type: "microphone", ready: false },
    { type: "source", id: "whistle" },
  ] as const) {
    const changed = setupReducer(ready, action);
    expect(effectiveAnalysis(changed).preferredRange).toBeUndefined();
    expect(changed.voice.low).toBeNull();
  }
  expect(
    effectiveAnalysis(setupReducer(ready, { type: "tempo", bpm: 120, beatsPerBar: 4 }))
      .preferredRange,
  ).toEqual(effectiveAnalysis(ready).preferredRange);
  const fallback = setupReducer(ready, { type: "sound-start" });
  expect(effectiveAnalysis(fallback).preferredRange).toBeUndefined();
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
