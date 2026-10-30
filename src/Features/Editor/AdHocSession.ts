import { adHocRecording, isAdHocDirty, type AdHocTuneDraft } from "./AdHocTune";
import { clearAdHocDraft, writeAdHocDraft } from "./AdHoc.storage";
import type { PortableTune } from "../../Tune/PortableTune.type";

export const RECOVERY_WARNING =
  "Temporary edits could not be stored. Refreshing may lose your work. You can still Save this tune.";
export class AdHocTuneSession {
  warning: string | null = null;
  promotedTo: string | null = null;
  private discarded = false;
  dirty: boolean;
  constructor(
    readonly tune: PortableTune,
    private draft: AdHocTuneDraft,
    private readonly changed: () => void,
    private persisted = false,
  ) {
    this.dirty = isAdHocDirty(tune, draft);
  }
  getDraft() {
    return this.draft;
  }
  getRecord() {
    return adHocRecording(this.tune, this.draft);
  }
  updateDraft(update: (draft: AdHocTuneDraft) => AdHocTuneDraft): void {
    if (this.promotedTo || this.discarded) return;
    this.draft = update(this.draft);
    this.dirty = isAdHocDirty(this.tune, this.draft);
    try {
      writeAdHocDraft(sessionStorage, this.draft);
      this.persisted = true;
      this.warning = null;
    } catch {
      this.warning = RECOVERY_WARNING;
    }
    this.changed();
  }
  discard(): void {
    // A failed removal must not allow the UI to claim the work was discarded.
    try {
      clearAdHocDraft(sessionStorage, this.draft.fragment);
    } catch (error) {
      if (this.persisted) {
        this.warning =
          "Could not discard the temporary draft. Allow session storage and retry, or Save your tune.";
        this.changed();
        throw error;
      }
    }
    this.discarded = true;
    this.dirty = false;
    this.changed();
  }
  markPromoted(id: string): void {
    this.promotedTo = id;
    this.dirty = false;
    this.changed();
  }
}
