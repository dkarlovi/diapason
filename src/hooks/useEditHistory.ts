import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { Recording } from "../Recording/Recording.type";
import { applyEditSnapshot, captureEditSnapshot, type EditSnapshot } from "../edit-state";
import {
  canRedoEdit,
  canUndoEdit,
  createEditHistory,
  currentEditCommit,
  displayEditSnapshot,
  reduceEditHistory,
  type EditHistory,
  type EditHistoryEvent,
} from "../edit-history";
import { createEditorWriter, type EditorWriter } from "../editor-save-queue";
import type { AdHocTuneSession } from "./useAdHocTune";
import { validateEditHistory } from "../edit-history-validation";
interface Options {
  session?: AdHocTuneSession | undefined;
  record: Recording | null;
  replaceRecord(record: Recording): void;
  beforeChange(): void;
}
function historyView(history: EditHistory | null) {
  if (!history)
    return {
      current: null,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      drafting: false,
    };
  const current = currentEditCommit(history);
  return {
    current,
    canUndo: canUndoEdit(history),
    canRedo: canRedoEdit(history),
    undoLabel: history.draft?.label ?? (history.cursor > 0 ? current.label : null),
    redoLabel: canRedoEdit(history) ? history.commits[history.cursor + 1]!.label : null,
    drafting: !!history.draft,
  };
}
export function useEditHistory(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const history = useRef<EditHistory | null>(null);
  const writer = useRef<EditorWriter | null>(null);
  const record = useRef(options.record);
  record.current = options.record;
  const [, render] = useState(0);
  const send = useCallback((event: EditHistoryEvent) => {
    if (!history.current || !record.current) return;
    const previous = history.current;
    const next = reduceEditHistory(previous, event);
    if (next === previous) return;
    history.current = next;
    record.current = applyEditSnapshot(record.current, displayEditSnapshot(next));
    latest.current.replaceRecord(record.current);
    latest.current.session?.updateDraft((draft) => ({ ...draft, history: next }));
    if (currentEditCommit(previous) !== currentEditCommit(next))
      writer.current?.enqueue(
        currentEditCommit(next),
        record.current.editHistory ? { ...next, draft: null } : undefined,
      );
    render((n) => n + 1);
  }, []);
  const finish = useCallback(
    () => send({ type: "commit", id: crypto.randomUUID(), createdAt: Date.now() }),
    [send],
  );
  const cancel = useCallback(() => {
    latest.current.beforeChange();
    send({ type: "cancel" });
  }, [send]);
  useLayoutEffect(() => {
    const initial = record.current;
    if (!initial) return;
    const session =
      latest.current.session?.getDraft().history ??
      (initial.editHistory
        ? validateEditHistory(initial.editHistory, initial.durationSec)
        : createEditHistory({
            id: initial.editHead?.commitId ?? crypto.randomUUID(),
            label: "Initial state",
            createdAt: Date.now(),
            snapshot: captureEditSnapshot(initial),
          }));
    const saves = latest.current.session
      ? null
      : createEditorWriter(initial.id, initial.editHead ?? null);
    history.current = session;
    writer.current = saves;
    render((n) => n + 1);
    return () => {
      // StrictMode's synthetic cleanup has no draft and therefore performs no write.
      if (history.current?.draft) finish();
      void saves?.flush().catch(() => {
        /* Shell status retains recovery after navigation. */
      });
      saves?.release();
      if (writer.current === saves) {
        history.current = null;
        writer.current = null;
      }
    };
  }, [options.record?.id, finish]);
  const begin = useCallback(
    (label: string) => {
      finish();
      latest.current.beforeChange();
      send({ type: "begin", label });
    },
    [finish, send],
  );
  const update = useCallback(
    (snapshot: EditSnapshot) => send({ type: "update", snapshot }),
    [send],
  );
  const change = useCallback(
    (label: string, transform: (value: Recording) => Recording) => {
      if (!record.current || !history.current) return;
      begin(label);
      update(captureEditSnapshot(transform(record.current!)));
      finish();
    },
    [begin, update, finish],
  );
  const undo = useCallback(() => {
    latest.current.beforeChange();
    send({ type: "undo" });
  }, [send]);
  const redo = useCallback(() => {
    latest.current.beforeChange();
    send({ type: "redo" });
  }, [send]);
  const flush = useCallback(async () => {
    finish();
    await writer.current?.flush();
    if (history.current && writer.current && !writer.current.getHead())
      writer.current.enqueue(
        currentEditCommit(history.current),
        record.current?.editHistory ? { ...history.current, draft: null } : undefined,
      );
    await writer.current?.flush();
  }, [finish]);
  return {
    ...historyView(history.current),
    getHistory: () => history.current,
    getCurrent: () => (history.current ? currentEditCommit(history.current) : null),
    begin,
    update,
    commit: finish,
    cancel,
    change,
    undo,
    redo,
    finish,
    flush,
    getHead: () => writer.current?.getHead() ?? null,
    stopSaving: async () => {
      await writer.current?.stop();
    },
  };
}
