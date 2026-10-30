import { useEffect, useRef, useState, type RefObject } from "react";
import { promoteAdHocTune } from "./TunePromotion.storage";
import { recordingPath } from "../../Routing/Routes";
import type { Notice } from "../../UI/useNotice";
import { useStudioMode, useStudioNavigate } from "../../Studio/useStudioMode";
import type { AdHocTuneSession } from "./AdHocSession";

interface Options {
  session: AdHocTuneSession | undefined;
  ready: boolean;
  finish(): void;
  notify(notice: Notice): void;
  saving: RefObject<boolean>;
}
function clearSavedDraft(session: AdHocTuneSession): string | null {
  try {
    session.discard();
    return null;
  } catch {
    return "Tune saved, but the temporary draft could not be cleared.";
  }
}
export function useSaveTune({ session, ready, finish, notify, saving }: Options) {
  const navigate = useStudioNavigate();
  const { embedded } = useStudioMode();
  const [savingTune, setSavingTune] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saveTune = async () => {
    if (!session || saving.current || session.promotedTo || !ready) return;
    finish();
    session.updateDraft((draft) => ({ ...draft, name: draft.name.trim() || "Untitled" }));
    saving.current = true;
    setSavingTune(true);
    try {
      const id = crypto.randomUUID();
      await promoteAdHocTune(session.tune, structuredClone(session.getDraft()), id, Date.now());
      if (!mounted.current) return;
      session.markPromoted(id);
      const warning = clearSavedDraft(session);
      await navigate(recordingPath(id) + (embedded ? "?tuneEmbed=1" : ""), {
        replace: true,
        state: warning ? { tuneSaveWarning: warning } : null,
      });
    } catch (error) {
      if (mounted.current)
        notify({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (mounted.current && !session.promotedTo) {
        saving.current = false;
        setSavingTune(false);
      }
    }
  };
  return { savingTune, saveTune };
}
