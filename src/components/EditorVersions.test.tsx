import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { EditorVersions } from "./EditorVersions";
import { useEditHistory } from "../hooks/useEditHistory";
import { useEditorVersions } from "../hooks/useEditorVersions";
import { recording } from "../test-support/recording";
import { putRecording, type Recording } from "../db";
afterEach(cleanup);
it("saves and renames versions with usable errors and no Git terminology", async () => {
  const initial = recording({ id: "version-ui" });
  await putRecording(initial);
  function Harness() {
    const [record, replaceRecord] = useState<Recording>(initial);
    const history = useEditHistory({ record, replaceRecord, beforeChange() {} });
    const versions = useEditorVersions({
      recordingId: initial.id,
      history,
      beforeAction() {},
      preview() {},
    });
    return <EditorVersions state={{ record, versions, previewId: null, stopPlayback() {} }} />;
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Versions" }));
  await user.type(screen.getByLabelText("Version name"), "First idea");
  await user.click(screen.getByRole("button", { name: "Save version" }));
  await screen.findByText("First idea");
  await user.type(screen.getByLabelText("Version name"), "first idea");
  await user.click(screen.getByRole("button", { name: "Save version" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "A version with this name already exists.",
  );
  expect((screen.getByLabelText("Version name") as HTMLInputElement).value).toBe("first idea");
  await user.click(screen.getByRole("button", { name: "Rename version First idea" }));
  const row = screen.getByRole("listitem");
  const input = within(row).getByLabelText("New version name");
  await user.clear(input);
  await user.type(input, "Second idea");
  await user.click(within(row).getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByText("Second idea")).toBeTruthy());
  expect(screen.queryByText(/save tag|restore tag|delete tag/i)).toBeNull();
});
