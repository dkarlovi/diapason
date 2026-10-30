import { adHocRecording, validateAdHocDraft, type AdHocTuneDraft } from "./AdHocTune";
import type { NoteRecording } from "../../Recording/Recording.type";
import { databaseTransaction } from "../../Storage/Database";
import { currentEditCommit } from "../../Editing/EditHistory";
import type { PortableTune } from "../../Tune/PortableTune.type";

export async function promoteAdHocTune(
  tune: PortableTune,
  draft: AdHocTuneDraft,
  recordingId: string,
  savedAt: number,
): Promise<NoteRecording> {
  const validated = validateAdHocDraft(draft, tune, draft.fragment);
  if (validated.history.draft) throw new Error("Finish the current edit before saving.");
  const recording: NoteRecording = {
    ...adHocRecording(tune, validated),
    id: recordingId,
    createdAt: savedAt,
    editHistory: validated.history,
    editHead: { commitId: currentEditCommit(validated.history).id, revision: 1 },
  };
  return databaseTransaction(["recordings", "versions"], "readwrite", (tx, result) => {
    tx.objectStore("recordings").add(recording);
    for (const version of validated.versions)
      tx.objectStore("versions").add({ ...version, id: crypto.randomUUID(), recordingId });
    result(recording);
  });
}
