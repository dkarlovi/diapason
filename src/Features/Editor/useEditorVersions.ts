import { useEffect, useRef, useState } from "react";
import { applyEditSnapshot } from "../../Editing/EditState";
import {
  deleteVersion,
  listVersions,
  renameVersion,
  saveVersion,
  validateEditSnapshot,
  type SavedVersion,
} from "../../Editing/Edit.storage";
import type { useEditHistory } from "./useEditHistory";
import type { AdHocTuneSession } from "./useAdHocTune";
import { updateAdHocVersion } from "./AdHocVersions";
interface Options {
  session?: AdHocTuneSession | undefined;
  recordingId: string;
  history: ReturnType<typeof useEditHistory>;
  beforeAction(): void;
  preview(version: SavedVersion): void;
}
export function useEditorVersions({
  recordingId,
  history,
  beforeAction,
  preview,
  session,
}: Options) {
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    running = useRef(false);
  useEffect(() => {
    const token = ++generation.current;
    setVersions([]);
    setError(null);
    setBusy(false);
    running.current = false;
    void (session ? Promise.resolve(session.getDraft().versions) : listVersions(recordingId))
      .then((rows) => {
        if (generation.current === token) setVersions(rows);
      })
      .catch((error) => {
        if (generation.current === token) setError(String(error));
      });
    return () => {
      generation.current++;
    };
  }, [recordingId]);
  const run = async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    if (running.current) return;
    const token = generation.current;
    const isCurrent = () => generation.current === token;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation(isCurrent);
      if (isCurrent()) {
        const rows = session ? session.getDraft().versions : await listVersions(recordingId);
        if (isCurrent()) setVersions(rows);
      }
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      if (isCurrent()) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  const find = (id: string) => versions.find((version) => version.id === id);
  return {
    versions,
    busy,
    error,
    saveVersion: (name: string) =>
      run(async (isCurrent) => {
        history.finish();
        beforeAction();
        const commit = history.getCurrent();
        if (!commit) throw new Error("Wait for the recording to finish loading.");
        const savedCommit = structuredClone(commit);
        await history.flush();
        if (!isCurrent()) return;
        const version: SavedVersion = {
          id: crypto.randomUUID(),
          recordingId,
          name,
          nameKey: name.trim().toLowerCase(),
          createdAt: Date.now(),
          commit: savedCommit,
        };
        if (session) updateAdHocVersion(session, version.id, version);
        else await saveVersion(version, history.getHead());
      }),
    previewVersion(id: string) {
      if (running.current) return;
      const version = find(id);
      if (!version) return;
      try {
        history.finish();
        preview(version);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    restoreVersion(id: string) {
      if (running.current) return;
      const version = find(id);
      if (!version) return;
      try {
        history.finish();
        beforeAction();
        history.change(`Restore version ${version.name}`, (record) => {
          validateEditSnapshot(version.commit.snapshot, record.durationSec);
          return applyEditSnapshot(record, version.commit.snapshot);
        });
        setError(null);
      } catch (cause) {
        history.cancel();
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    renameVersion: (id: string, name: string) =>
      run(async () => {
        if (session) updateAdHocVersion(session, id, name);
        else await renameVersion(recordingId, id, name);
      }),
    deleteVersion: (id: string) =>
      run(async () => {
        beforeAction();
        if (session) updateAdHocVersion(session, id, null);
        else await deleteVersion(recordingId, id);
      }),
  };
}
