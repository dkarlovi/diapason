import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import type { AdHocTuneSession } from "./useAdHocTune";
interface Options {
  session: AdHocTuneSession;
  embedded: boolean;
  beforeLeave(): void;
}
export function useAdHocNavigation(options: Options): void {
  const latest = useRef(options);
  latest.current = options;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const { session } = latest.current;
    if (
      session.promotedTo &&
      nextLocation.pathname === `/recording/${encodeURIComponent(session.promotedTo)}`
    )
      return false;
    return (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.hash !== nextLocation.hash
    );
  });
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const { session, embedded, beforeLeave } = latest.current;
    if (embedded) {
      blocker.reset();
      return;
    }
    beforeLeave();
    if (session.dirty && !window.confirm("You have unsaved changes. Discard them and leave?")) {
      blocker.reset();
      return;
    }
    try {
      session.discard();
      blocker.proceed();
    } catch {
      blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!latest.current.session.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
}
