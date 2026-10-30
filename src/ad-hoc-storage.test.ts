import { beforeEach, expect, it } from "vitest";
import { readAdHocDraft, writeAdHocDraft, clearAdHocDraft } from "./ad-hoc-storage";
import { createAdHocDraft } from "./ad-hoc-tune";
import { createPortableTune } from "./portable-tune";
import { noteRecording } from "../tests/support/note-recording";
beforeEach(() => sessionStorage.clear());
it("keeps drafts separate and clears them definitively", () => {
  const draft = createAdHocDraft(createPortableTune(noteRecording(), []), "#tune=a", "a", 1);
  writeAdHocDraft(sessionStorage, draft);
  expect(readAdHocDraft(sessionStorage, draft.fragment)).toEqual(draft);
  expect(readAdHocDraft(sessionStorage, "#tune=b")).toBeNull();
  clearAdHocDraft(sessionStorage, draft.fragment);
  expect(readAdHocDraft(sessionStorage, draft.fragment)).toBeNull();
});
