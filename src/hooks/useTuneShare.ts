import { useRef, useState } from "react";
import { loadShareTune } from "../tune-sharing";
import { tuneUrl } from "../tune-url";
import { encodeTuneMidi } from "../tune-midi";
import { downloadBlob } from "../ui";
import { exportSlug } from "../editor-model";
import type { Notice } from "./useNotice";
export function useTuneShare(
  showNotice: (notice: Notice | null) => void,
  beforeShare?: () => Promise<void>,
) {
  const [busy, setBusy] = useState(false);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const pending = useRef(false);
  const run = async (id: string, midi: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFallbackLink(null);
    try {
      await beforeShare?.();
      const tune = await loadShareTune(id);
      if (midi) {
        downloadBlob(await encodeTuneMidi(tune), `${exportSlug(tune.name, Date.now())}.mid`);
        showNotice({ kind: "success", message: "Diapason MIDI downloaded" });
      } else {
        const url = await tuneUrl(tune, window.location.origin);
        try {
          await navigator.clipboard.writeText(url);
          showNotice({ kind: "success", message: "Tune link copied" });
        } catch {
          setFallbackLink(url);
          showNotice({ kind: "info", message: "Select and copy the tune link below." });
        }
      }
    } catch (error) {
      showNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    fallbackLink,
    clearFallback: () => setFallbackLink(null),
    copyLink: (id: string) => run(id, false),
    downloadMidi: (id: string) => run(id, true),
  };
}
