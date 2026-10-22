import { useCallback, useEffect, useState } from "react";
import {
  activeOutput,
  connectMidi,
  midiOutputs,
  midiSupported,
  onOutputChange,
  selectOutput,
} from "../midiout";

const CONNECT = "__connect";

function snapshot() {
  return { supported: midiSupported(), ports: midiOutputs(), selected: activeOutput()?.id ?? "" };
}

export function useMidiOutput() {
  const [state, setState] = useState(snapshot);
  const refresh = useCallback(() => setState(snapshot()), []);
  useEffect(() => {
    const unsubscribe = onOutputChange(refresh);
    void connectMidi(false);
    return unsubscribe;
  }, [refresh]);

  const change = useCallback(
    async (id: string) => {
      if (id !== CONNECT) {
        selectOutput(id);
        return;
      }
      if (!(await connectMidi(true))) alert("MIDI access was denied or is unavailable.");
      else if (!midiOutputs().length)
        alert(
          "MIDI is enabled, but no output devices were found. Start a synth or create a virtual MIDI port.",
        );
      const first = midiOutputs()[0];
      if (first) selectOutput(first.id);
      else refresh();
    },
    [refresh],
  );

  return { ...state, change, connectValue: CONNECT };
}
