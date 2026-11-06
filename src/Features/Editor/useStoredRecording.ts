import { useEffect, useEffectEvent } from "react";
import type { Recording } from "../../Recording/Recording.type";
import { getRecording, subscribeRecording } from "../../Recording/Recording.storage";
import type { AdHocTuneSession } from "./AdHocSession";

interface Options {
  id: string;
  session?: AdHocTuneSession | undefined;
  current: () => Recording | null;
  isIdle: () => boolean;
  adopt: (record: Recording) => void;
  deleted: (record: Recording) => void;
}
/**
 * Shows whatever another tab or embed saved last. An editor with unsaved local work keeps it;
 * its own save lands afterwards and reaches every other instance the same way.
 */
export function useStoredRecording({ id, session, current, isIdle, adopt, deleted }: Options) {
  const ready = useEffectEvent(() => !!current() && isIdle());
  const show = useEffectEvent((stored: Recording | undefined) => {
    const shown = current();
    if (!shown || !ready()) return;
    if (!stored) deleted(shown);
    else
      try {
        adopt(stored);
      } catch {
        /* A record this build cannot read keeps the editor on its current state. */
      }
  });
  useEffect(() => {
    if (session) return session.subscribe(() => show(session.getRecord()));
    let active = true;
    const unsubscribe = subscribeRecording(id, () => {
      if (!ready()) return;
      void getRecording(id).then(
        (stored) => {
          if (active) show(stored);
        },
        () => {},
      );
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id, session]);
}
