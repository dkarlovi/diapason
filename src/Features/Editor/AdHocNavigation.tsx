import { LockedRecordingNavigation } from "./LockedRecordingNavigation";
import { useAdHocNavigation } from "./useAdHocNavigation";
import type { AdHocTuneSession } from "./useAdHocTune";
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
