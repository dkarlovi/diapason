import { useEffect } from "react";
import { useBlocker } from "react-router";
import { recordingPath } from "../../Routing/Routes";
import { useAdHocNavigation } from "./useAdHocNavigation";
import type { AdHocTuneSession } from "./AdHocSession";

function LockedRecordingNavigation({ id }: { id: string }) {
  const blocker = useBlocker(({ nextLocation }) => nextLocation.pathname !== recordingPath(id));
  useEffect(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);
  return null;
}

function AdHocNavigation(props: {
  session: AdHocTuneSession;
  embedded: boolean;
  beforeLeave(): void;
}) {
  useAdHocNavigation(props);
  return null;
}

export function EditorSessionNavigation({
  id,
  session,
  embedded,
  tuneLocked,
  beforeLeave,
}: {
  id: string;
  session: AdHocTuneSession | undefined;
  embedded: boolean;
  tuneLocked: boolean;
  beforeLeave(): void;
}) {
  if (session)
    return <AdHocNavigation session={session} embedded={embedded} beforeLeave={beforeLeave} />;
  return tuneLocked ? <LockedRecordingNavigation id={id} /> : null;
}
