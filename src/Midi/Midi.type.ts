export type MidiEvent =
  | { tick: number; type: "on" | "off"; midi: number }
  | { tick: number; type: "bend"; value: number }
  | { tick: number; type: "control"; controller: number; value: number };

export type MidiBendMessage =
  | { position: number; type: "bend"; value: number }
  | { position: number; type: "control"; controller: number; value: number };
