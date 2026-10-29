import { useEffect } from "react";
import { useBlocker } from "react-router";
import { recordingPath } from "../router";
export function LockedRecordingNavigation({ id }: { id: string }) {
  const blocker = useBlocker(({ nextLocation }) => nextLocation.pathname !== recordingPath(id));
  useEffect(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);
  return null;
}
