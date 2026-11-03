import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { noteRecording } from "../../../tests/support/note-recording";
import { createPortableTune } from "../../Tune/PortableTune";
import { reduceEditHistory } from "../../Editing/EditHistory";
import { subscribeStoredChanges } from "../../Storage/StoredChanges";
import type { StoredChange } from "../../Storage/StoredChange.type";
import { AdHocTuneSession } from "./AdHocSession";
import { createAdHocDraft, type AdHocTuneDraft } from "./AdHocTune";

const tune = createPortableTune(noteRecording(), []);
const fragment = "#tune=shared";
const open = (id: string) =>
  new AdHocTuneSession(tune, createAdHocDraft(tune, fragment, id, 1), () => {});
const edit = (draft: AdHocTuneDraft, octave: number, label = "Octave"): AdHocTuneDraft => {
  let history = reduceEditHistory(draft.history, { type: "begin", label });
  history = reduceEditHistory(history, {
    type: "update",
    snapshot: {
      schemaVersion: 1,
      intent: { ...history.commits[0]!.snapshot.intent, play: { instrument: "beep", octave } },
    },
  });
  return { ...draft, history };
};
const commit = (draft: AdHocTuneDraft): AdHocTuneDraft => ({
  ...draft,
  history: reduceEditHistory(draft.history, {
    type: "commit",
    id: crypto.randomUUID(),
    createdAt: 2,
  }),
});
type DraftChange = Extract<StoredChange, { kind: "tune-draft" }>;
const receive = (session: AdHocTuneSession, change: StoredChange) => {
  const { draft, savedAt, source } = change as DraftChange;
  session.receive(draft, savedAt, source);
};
let sent: StoredChange[] = [];
let stop = () => {};
beforeEach(() => {
  sessionStorage.clear();
  sent = [];
  stop = subscribeStoredChanges((change) => sent.push(change));
});
afterEach(() => stop());
const delivered = () => new Promise((resolve) => setTimeout(resolve, 0));

it("shows the draft another instance saved last while keeping its own identity", async () => {
  const a = open("a"),
    b = open("b");
  const notified = vi.fn();
  b.subscribe(notified);
  a.updateDraft((draft) => commit(edit(draft, -1)));
  await delivered();
  expect(sent).toHaveLength(1);
  receive(b, sent[0]!);
  expect(notified).toHaveBeenCalledTimes(1);
  expect(b.getDraft().id).toBe("b");
  expect(b.getRecord().play).toEqual({ instrument: "beep", octave: -1 });
  expect(b.dirty).toBe(true);
  receive(a, sent[0]!);
  expect(a.getDraft().id).toBe("a");
});
it("announces only committed drafts and keeps a gesture in progress", async () => {
  const a = open("a"),
    b = open("b");
  a.updateDraft((draft) => edit(draft, -1));
  await delivered();
  expect(sent).toEqual([]);
  b.updateDraft((draft) => edit(draft, 1));
  a.updateDraft(commit);
  await delivered();
  receive(b, sent[0]!);
  expect(b.getDraft().history.draft).not.toBeNull();
  expect(b.getRecord().play).toEqual({ instrument: "beep", octave: 1 });
});
it("ignores older saves and drafts it cannot validate", async () => {
  const a = open("a"),
    b = open("b");
  a.updateDraft((draft) => commit(edit(draft, -1)));
  await delivered();
  const older = sent[0] as DraftChange;
  receive(b, older);
  b.updateDraft((draft) => commit(edit(draft, 2)));
  receive(b, older);
  expect(b.getRecord().play?.octave).toBe(2);
  const latest = { ...older, savedAt: Number.MAX_SAFE_INTEGER };
  receive(b, { ...latest, draft: { broken: true } });
  expect(b.getRecord().play?.octave).toBe(2);
});
