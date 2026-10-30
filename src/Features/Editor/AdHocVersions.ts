import type { AdHocTuneSession } from "./AdHocSession";
import type { SavedVersion } from "../../Editing/Edit.storage";
export function updateAdHocVersion(
  session: AdHocTuneSession,
  id: string,
  change: SavedVersion | string | null,
): void {
  session.updateDraft((draft) => {
    let versions = draft.versions.filter((version) => version.id !== id);
    if (change !== null) {
      const value =
        typeof change === "string"
          ? { ...draft.versions.find((version) => version.id === id)!, name: change }
          : change;
      const name = value.name.trim(),
        nameKey = name.toLowerCase();
      if (!name) throw new Error("Enter a version name.");
      if (versions.some((version) => version.nameKey === nameKey))
        throw new Error("A version with this name already exists.");
      versions = [...versions, { ...value, name, nameKey }];
    }
    return { ...draft, versions: versions.sort((a, b) => b.createdAt - a.createdAt) };
  });
}
