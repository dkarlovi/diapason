import { useEffect, useRef, useState } from "react";
import { applyEditSnapshot } from "../edit-state";
import {
  deleteVersion,
  listVersions,
  renameVersion,
  saveVersion,
  validateEditSnapshot,
  type SavedVersion,
} from "../edit-storage";
import type { useEditHistory } from "./useEditHistory";
interface Options {
  recordingId: string;
  history: ReturnType<typeof useEditHistory>;
  beforeAction(): void;
  preview(version: SavedVersion): void;
}
export function useEditorVersions({ recordingId, history, beforeAction, preview }: Options) {
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
    void listVersions(recordingId)
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
        const rows = await listVersions(recordingId);
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
        await saveVersion(
          {
            id: crypto.randomUUID(),
            recordingId,
            name,
            nameKey: name.trim().toLowerCase(),
            createdAt: Date.now(),
            commit: savedCommit,
          },
          history.getHead(),
        );
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
        await renameVersion(recordingId, id, name);
      }),
    deleteVersion: (id: string) =>
      run(async () => {
        beforeAction();
        await deleteVersion(recordingId, id);
      }),
  };
}
