import { useState } from "react";
import { Button } from "../UI/Primitives";
import type { EditorState } from "../hooks/useEditor";
import type { SavedVersion } from "../edit-storage";
type VersionState = Pick<EditorState, "versions" | "record" | "previewId" | "stopPlayback">;
function VersionRow({ version, state }: { version: SavedVersion; state: VersionState }) {
  const [renaming, setRenaming] = useState(false),
    [name, setName] = useState(version.name);
  const { versions } = state;
  const previewing = state.previewId === `version-${version.id}`;
  return (
    <li className="editor-version-row">
      {renaming ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void versions
              .renameVersion(version.id, name)
              .then(() => setRenaming(false))
              .catch(() => {});
          }}
        >
          <label>
            New version name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              disabled={versions.busy}
            />
          </label>
          <Button type="submit" disabled={versions.busy || !name.trim()}>
            Save name
          </Button>
          <Button type="button" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <strong>{version.name}</strong>
          <time dateTime={new Date(version.createdAt).toISOString()}>
            {new Date(version.createdAt).toLocaleString()}
          </time>
          <div className="editor-version-actions">
            <Button
              disabled={versions.busy}
              aria-label={`${previewing ? "Stop preview of" : "Preview version"} ${version.name}`}
              aria-pressed={previewing}
              onClick={() =>
                previewing ? state.stopPlayback() : versions.previewVersion(version.id)
              }
            >
              {previewing ? "Stop" : "Preview"}
            </Button>
            <Button
              disabled={versions.busy}
              aria-label={`Restore version ${version.name}`}
              onClick={() => versions.restoreVersion(version.id)}
            >
              Restore
            </Button>
            <Button
              disabled={versions.busy}
              aria-label={`Rename version ${version.name}`}
              onClick={() => {
                setName(version.name);
                setRenaming(true);
              }}
            >
              Rename
            </Button>
            <Button
              disabled={versions.busy}
              variant="danger"
              aria-label={`Delete version ${version.name}`}
              onClick={() => {
                if (confirm(`Delete version “${version.name}”?`))
                  void versions.deleteVersion(version.id).catch(() => {});
              }}
            >
              Delete
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
export function EditorVersions({ state }: { state: VersionState }) {
  const [name, setName] = useState("");
  const { versions } = state;
  return (
    <>
      <h2>Versions</h2>
      <p>Name a state to keep it after this editing session.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void versions
            .saveVersion(name)
            .then(() => setName(""))
            .catch(() => {});
        }}
      >
        <label>
          Version name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={versions.busy}
          />
        </label>
        <Button type="submit" disabled={versions.busy || !name.trim()}>
          Save version
        </Button>
      </form>
      {versions.error && <p role="alert">{versions.error}</p>}
      {versions.versions.length ? (
        <ul>
          {versions.versions.map((version) => (
            <VersionRow key={version.id} version={version} state={state} />
          ))}
        </ul>
      ) : (
        <p>No saved versions yet.</p>
      )}
    </>
  );
}
