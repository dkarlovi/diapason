import { useEffect, useState } from "react";
import { createAdHocDraft, validateAdHocDraft } from "./AdHocTune";
import { clearAdHocDraft, readAdHocDraft } from "./AdHoc.storage";
import { AdHocTuneSession, RECOVERY_WARNING } from "./AdHocSession";
import { tuneFromFragment } from "../../Tune/TuneUrl";

export function useAdHocTune(fragment: string) {
  const [session, setSession] = useState<AdHocTuneSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corrupt, setCorrupt] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [, render] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError(null);
    setCorrupt(false);
    void (async () => {
      try {
        const tune = await tuneFromFragment(fragment);
        if (cancelled) return;
        if (!tune) throw new Error("This link does not contain a tune.");
        let stored: unknown = null,
          warning: string | null = null;
        try {
          stored = readAdHocDraft(sessionStorage, fragment);
        } catch (cause) {
          if (cause instanceof SyntaxError) {
            setCorrupt(true);
            throw new Error(
              "The temporary draft is damaged. Discard it to reopen the original tune.",
            );
          }
          warning = RECOVERY_WARNING;
        }
        let draft;
        try {
          draft =
            stored === null
              ? createAdHocDraft(tune, fragment, crypto.randomUUID(), Date.now())
              : validateAdHocDraft(stored, tune, fragment);
        } catch {
          setCorrupt(true);
          throw new Error(
            "The temporary draft is damaged. Discard it to reopen the original tune.",
          );
        }
        const controller = new AdHocTuneSession(
          tune,
          draft,
          () => {
            if (!cancelled) render((n) => n + 1);
          },
          stored !== null,
        );
        controller.warning = warning;
        setSession(controller);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fragment, attempt]);
  return {
    session,
    error,
    corrupt,
    retry: () => setAttempt((n) => n + 1),
    discardCorruptDraft: () => {
      try {
        clearAdHocDraft(sessionStorage, fragment);
        setAttempt((n) => n + 1);
      } catch {
        setError("Could not discard the temporary draft. Allow session storage and retry.");
      }
    },
  };
}
