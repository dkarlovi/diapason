import { beforeEach, expect, it, vi } from "vitest";
import {
  announceAdHocDraft,
  clearAdHocDraft,
  readAdHocDraft,
  subscribeAdHocDrafts,
  writeAdHocDraft,
} from "./AdHoc.storage";
import { createAdHocDraft } from "./AdHocTune";
import { createPortableTune } from "../../Tune/PortableTune";
import { noteRecording } from "../../../tests/support/note-recording";
beforeEach(() => sessionStorage.clear());
it("keeps drafts separate and clears them definitively", () => {
  const draft = createAdHocDraft(createPortableTune(noteRecording(), []), "#tune=a", "a", 1);
  writeAdHocDraft(sessionStorage, draft);
  expect(readAdHocDraft(sessionStorage, draft.fragment)).toEqual(draft);
  expect(readAdHocDraft(sessionStorage, "#tune=b")).toBeNull();
  clearAdHocDraft(sessionStorage, draft.fragment);
  expect(readAdHocDraft(sessionStorage, draft.fragment)).toBeNull();
});
it("hands announced drafts only to subscribers of the same tune", async () => {
  const draft = createAdHocDraft(createPortableTune(noteRecording(), []), "#tune=a", "a", 1);
  const same = vi.fn(),
    other = vi.fn();
  const stopSame = subscribeAdHocDrafts("#tune=a", same);
  const stopOther = subscribeAdHocDrafts("#tune=b", other);
  announceAdHocDraft(draft, 5, "source");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(same).toHaveBeenCalledWith(draft, 5, "source");
  expect(other).not.toHaveBeenCalled();
  stopSame();
  stopOther();
});
