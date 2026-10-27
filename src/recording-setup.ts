import { getSoundProfile, type AnalysisSettings } from "./recording-profiles";
import { voiceRange, type EndpointResult } from "./voice-range";
import { setupCheck } from "./capture-model";

export type VoiceTarget = "low" | "high";
export type SetupStep = "sound" | "microphone" | "room" | "sound-check" | "tempo" | "record";
export type CheckStatus = "unchecked" | "checking" | "passed" | "attention";
export interface SetupCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  blocking: boolean;
}
export interface MeasurementResult {
  pass: boolean;
  checks: SetupCheck[];
}
export interface RoomResult extends MeasurementResult {
  floor: number;
  gate: number;
}
export interface SetupState {
  profileId: string;
  soundConfirmed: boolean;
  micReady: boolean;
  deviceId: string;
  gain: number;
  room: RoomResult | null;
  sound: MeasurementResult | null;
  voice: Record<VoiceTarget, EndpointResult | null>;
  soundTarget: VoiceTarget | null;
  measuring: "room" | "sound" | null;
  bpm: number;
  beatsPerBar: number;
  tempoConfirmed: boolean;
  busy: boolean;
  revision: number;
}
export const initialSetup: SetupState = {
  profileId: "whistle",
  soundConfirmed: false,
  micReady: false,
  deviceId: "",
  gain: 1,
  room: null,
  sound: null,
  voice: { low: null, high: null },
  soundTarget: null,
  measuring: null,
  bpm: NaN,
  beatsPerBar: 4,
  tempoConfirmed: false,
  busy: false,
  revision: 0,
};
export type SetupAction =
  | { type: "source"; id: string }
  | { type: "device"; id: string }
  | { type: "microphone"; ready: boolean }
  | { type: "gain"; value: number }
  | { type: "room-start" }
  | { type: "sound-start" }
  | { type: "endpoint-start"; target: VoiceTarget }
  | { type: "endpoint-result"; target: VoiceTarget; revision: number; result: EndpointResult }
  | { type: "cancel" }
  | { type: "room-result"; revision: number; result: RoomResult }
  | { type: "sound-result"; revision: number; result: MeasurementResult }
  | { type: "tempo"; bpm: number; beatsPerBar: number }
  | { type: "tempo-confirm" }
  | { type: "busy"; value: boolean };
export function validTempo(bpm: number, beatsPerBar: number): boolean {
  return (
    Number.isInteger(bpm) &&
    bpm >= 40 &&
    bpm <= 220 &&
    Number.isInteger(beatsPerBar) &&
    beatsPerBar >= 1 &&
    beatsPerBar <= 12
  );
}
function invalidate(state: SetupState): SetupState {
  return {
    ...state,
    room: null,
    sound: null,
    voice: { low: null, high: null },
    soundTarget: null,
    measuring: null,
    revision: state.revision + 1,
  };
}
function changeInput(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "source":
      return {
        ...state,
        profileId: action.id,
        soundConfirmed: true,
        ...(action.id !== state.profileId
          ? {
              sound: null,
              voice: { low: null, high: null },
              soundTarget: null,
              measuring: null,
              revision: state.revision + 1,
            }
          : {}),
      };
    case "device":
      return { ...invalidate(state), deviceId: action.id, micReady: false };
    case "microphone":
      return action.ready
        ? { ...state, micReady: true }
        : { ...invalidate(state), micReady: false };
    case "gain":
      return state.gain === action.value ? state : { ...invalidate(state), gain: action.value };
    default:
      return state;
  }
}
function changeMeasurement(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "room-start":
      return { ...invalidate(state), measuring: "room" };
    case "sound-start":
      return {
        ...state,
        sound: null,
        voice: { low: null, high: null },
        soundTarget: null,
        measuring: "sound",
        revision: state.revision + 1,
      };
    case "endpoint-start":
      return {
        ...state,
        sound: null,
        voice: { ...state.voice, [action.target]: null },
        soundTarget: action.target,
        measuring: "sound",
        revision: state.revision + 1,
      };
    case "endpoint-result":
      return action.revision === state.revision &&
        state.measuring === "sound" &&
        state.soundTarget === action.target
        ? finishEndpoint(state, action.target, action.result)
        : state;
    case "cancel":
      return { ...state, measuring: null, soundTarget: null, revision: state.revision + 1 };
    case "room-result":
      return action.revision === state.revision && state.measuring === "room"
        ? { ...state, room: action.result, measuring: null }
        : state;
    case "sound-result":
      return action.revision === state.revision &&
        state.measuring === "sound" &&
        state.soundTarget === null
        ? { ...state, sound: action.result, measuring: null }
        : state;
    default:
      return changeInput(state, action);
  }
}

function finishEndpoint(
  state: SetupState,
  target: VoiceTarget,
  result: EndpointResult,
): SetupState {
  const voice = { ...state.voice, [target]: result };
  const low = voice.low,
    high = voice.high;
  let sound: MeasurementResult | null = null;
  if (low?.pass && high?.pass && low.frequency !== null && high.frequency !== null) {
    const range = voiceRange(
      low.frequency,
      high.frequency,
      getSoundProfile(state.profileId).analysis,
    );
    sound = {
      pass: range !== null,
      checks: [
        setupCheck(
          "range-order",
          "Comfortable range captured",
          range !== null,
          range
            ? "Low and high notes checked"
            : "Your high note must be above your low note — retry either note",
        ),
      ],
    };
  }
  return { ...state, voice, sound, measuring: null, soundTarget: null };
}

export function effectiveAnalysis(state: SetupState): AnalysisSettings {
  const analysis = getSoundProfile(state.profileId).analysis;
  const { low, high } = state.voice;
  const range =
    state.sound?.pass &&
    low?.pass &&
    high?.pass &&
    low.frequency !== null &&
    high.frequency !== null
      ? voiceRange(low.frequency, high.frequency, analysis)
      : null;
  return range ? { ...analysis, preferredRange: range } : analysis;
}
export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "tempo":
      return action.bpm === state.bpm && action.beatsPerBar === state.beatsPerBar
        ? state
        : { ...state, bpm: action.bpm, beatsPerBar: action.beatsPerBar, tempoConfirmed: false };
    case "tempo-confirm":
      return validTempo(state.bpm, state.beatsPerBar) ? { ...state, tempoConfirmed: true } : state;
    case "busy":
      return { ...state, busy: action.value };
    default:
      return changeMeasurement(state, action);
  }
}

export function nextSetupStep(state: SetupState): SetupStep {
  if (!state.soundConfirmed) return "sound";
  if (!state.micReady) return "microphone";
  if (!state.room?.pass) return "room";
  if (!state.sound?.pass) return "sound-check";
  if (!state.tempoConfirmed || !validTempo(state.bpm, state.beatsPerBar)) return "tempo";
  return "record";
}
export function canRecord(state: SetupState): boolean {
  return nextSetupStep(state) === "record" && !state.measuring && !state.busy;
}
