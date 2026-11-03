import { adHocRecording, isAdHocDirty, validateAdHocDraft, type AdHocTuneDraft } from "./AdHocTune";
import { announceAdHocDraft, clearAdHocDraft, writeAdHocDraft } from "./AdHoc.storage";
import type { PortableTune } from "../../Tune/PortableTune.type";

export const RECOVERY_WARNING =
  "Temporary edits could not be stored. Refreshing may lose your work. You can still Save this tune.";
export class AdHocTuneSession {
  warning: string | null = null;
  promotedTo: string | null = null;
  private discarded = false;
  private readonly source = crypto.randomUUID();
  private savedAt = 0;
  private readonly listeners = new Set<() => void>();
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
  /** Notifies when another instance of this tune saved a newer draft that this one now shows. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  updateDraft(update: (draft: AdHocTuneDraft) => AdHocTuneDraft): void {
    if (this.promotedTo || this.discarded) return;
    this.draft = update(this.draft);
    this.dirty = isAdHocDirty(this.tune, this.draft);
    this.store();
    if (!this.draft.history.draft) {
      this.savedAt = Math.max(Date.now(), this.savedAt + 1);
      announceAdHocDraft(this.draft, this.savedAt, this.source);
    }
    this.changed();
  }
  /** Shows a draft another instance saved, unless this one saved later or is mid-gesture. */
  receive(value: unknown, savedAt: number, source: string): void {
    if (
      source === this.source ||
      this.promotedTo ||
      this.discarded ||
      this.draft.history.draft ||
      savedAt < this.savedAt ||
      (savedAt === this.savedAt && source < this.source)
    )
      return;
    let incoming: AdHocTuneDraft;
    try {
      incoming = validateAdHocDraft(value, this.tune, this.draft.fragment);
    } catch {
      return;
    }
    const { id, createdAt } = this.draft;
    this.draft = {
      ...incoming,
      id,
      createdAt,
      versions: incoming.versions.map((version) => ({ ...version, recordingId: id })),
    };
    this.savedAt = savedAt;
    this.dirty = isAdHocDirty(this.tune, this.draft);
    this.store();
    for (const listener of this.listeners) listener();
    this.changed();
  }
  private store(): void {
    try {
      writeAdHocDraft(sessionStorage, this.draft);
      this.persisted = true;
      this.warning = null;
    } catch {
      this.warning = RECOVERY_WARNING;
    }
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
