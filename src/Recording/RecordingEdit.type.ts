import type { EDIT_FIELDS } from "./EditFields";
import type { Recording } from "./Recording.type";

export interface EditHead {
  commitId: string;
  revision: number;
}

export interface EditCommit {
  id: string;
  label: string;
  createdAt: number;
  snapshot: EditSnapshot;
}

export interface EditHistory {
  commits: readonly EditCommit[];
  cursor: number;
  draft: { label: string; snapshot: EditSnapshot } | null;
}

export interface EditSnapshot {
  schemaVersion: 1;
  intent: Pick<Recording, (typeof EDIT_FIELDS)[number]>;
}
