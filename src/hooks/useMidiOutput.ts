import { useEffect } from "react";
import { bindOutputSelect } from "../midiout";

export function useMidiOutput(): void {
  useEffect(() => {
    bindOutputSelect(document.getElementById("midi-output") as HTMLSelectElement);
  }, []);
}
