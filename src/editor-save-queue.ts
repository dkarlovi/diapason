import { EditStorageError, saveEditCommit, type EditHead } from "./edit-storage";
import type { EditCommit, EditHistory } from "./edit-history";
export interface EditorSaveStatus {
  recordingId: string;
  state: "saved" | "saving" | "unsaved" | "conflict";
  error: string | null;
}
export interface EditorWriter {
  enqueue(commit: EditCommit, history?: EditHistory): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  getHead(): EditHead | null;
  release(): void;
  stop(): Promise<void>;
}
interface RegisteredWriter {
  writer: EditorWriter;
  status: EditorSaveStatus;
}
const registry = new Set<RegisteredWriter>();
const listeners = new Set<() => void>();
let statuses: readonly EditorSaveStatus[] = [];
function publish() {
  statuses = [...registry].map((r) => r.status);
  for (const listener of listeners) listener();
}
export const subscribeEditorSaves = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getEditorSaveStatuses = (): readonly EditorSaveStatus[] => statuses;
export function createEditorWriter(
  recordingId: string,
  initialHead: EditHead | null,
): EditorWriter {
  let head = initialHead;
  type Save = { commit: EditCommit; history?: EditHistory };
  let pending: Save[] = [];
  let latest: Save | null = null;
  let running: Promise<void> | null = null;
  let failure: unknown;
  let closed = false,
    stopped = false;
  const entry: RegisteredWriter = {
    writer: null!,
    status: { recordingId, state: "saved", error: null },
  };
  const report = (state: EditorSaveStatus["state"], error: unknown = null) => {
    entry.status = {
      recordingId,
      state,
      error: error === null ? null : error instanceof Error ? error.message : String(error),
    };
    if (closed && state === "saved") registry.delete(entry);
    publish();
  };
  const pump = () => {
    if (running || failure || stopped || !pending.length) return;
    report("saving");
    running = (async () => {
      while (pending.length && !stopped) {
        const { commit, history } = pending.shift()!;
        try {
          head = await saveEditCommit(recordingId, commit, head, history);
        } catch (error) {
          failure = error;
          report(
            error instanceof EditStorageError && error.code === "conflict" ? "conflict" : "unsaved",
            error,
          );
          return;
        }
      }
      report("saved");
    })().finally(() => {
      running = null;
      if (!failure && !stopped && pending.length) pump();
    });
  };
  const writer: EditorWriter = {
    enqueue(commit, history) {
      if (stopped) return;
      latest = structuredClone({ commit, ...(history ? { history } : {}) });
      pending.push(latest);
      pump();
    },
    async flush() {
      pump();
      while (running) await running;
      if (failure) throw failure;
    },
    async retry() {
      if (failure instanceof EditStorageError && failure.code === "conflict") throw failure;
      if (running) await running;
      failure = undefined;
      pending = latest ? [latest] : [];
      await writer.flush();
    },
    getHead: () => head,
    release() {
      closed = true;
      if (!running && !failure && !pending.length) {
        registry.delete(entry);
        publish();
      }
    },
    async stop() {
      stopped = true;
      pending = [];
      if (running) await running;
      registry.delete(entry);
      publish();
    },
  };
  entry.writer = writer;
  registry.add(entry);
  publish();
  return writer;
}
export async function flushEditorSaves(recordingId?: string): Promise<void> {
  // Snapshot membership: draining a released writer removes it from the live registry.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const entry of [...registry])
    if (recordingId === undefined || entry.status.recordingId === recordingId)
      await entry.writer.flush();
}
export async function retryEditorSaves(recordingId: string): Promise<void> {
  // Snapshot membership: draining a released writer removes it from the live registry.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const entry of [...registry])
    if (entry.status.recordingId === recordingId) await entry.writer.retry();
}

export async function stopEditorSaves(recordingId: string): Promise<void> {
  const writers = [...registry].filter((entry) => entry.status.recordingId === recordingId);
  await Promise.all(writers.map((entry) => entry.writer.stop()));
}
