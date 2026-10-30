import { useLocation } from "react-router";
import { useAdHocTune } from "../hooks/useAdHocTune";
import { Editor } from "./Editor";
import { Button } from "../UI/Primitives";
export function AdHocTuneRoute() {
  const { hash } = useLocation();
  const { session, error, corrupt, retry, discardCorruptDraft } = useAdHocTune(hash);
  if (error)
    return (
      <div role="alert">
        Could not open tune: {error}{" "}
        <Button onClick={corrupt ? discardCorruptDraft : retry}>
          {corrupt ? "Discard draft" : "Retry loading"}
        </Button>
      </div>
    );
  if (!session) return <p role="status">Opening tune…</p>;
  return (
    <>
      <Editor key={session.getDraft().id} id={session.getDraft().id} session={session} />
      {session.warning && <p role="alert">{session.warning}</p>}
    </>
  );
}
