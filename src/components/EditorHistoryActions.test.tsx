import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { EditorHistoryActions } from "./EditorHistoryActions";
afterEach(cleanup);
it("exposes global chronological undo and redo without Tune", () => {
  function Harness() {
    const [edited, set] = useState(true);
    return (
      <>
        <output>{edited ? "Default pitch" : "Custom pitch"}</output>
        <EditorHistoryActions
          state={{
            canUndo: edited,
            canRedo: !edited,
            undoLabel: "Reset pitch",
            redoLabel: "Reset pitch",
            undo: () => set(false),
            redo: () => set(true),
            editingDisabled: false,
          }}
        />
      </>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Undo reset pitch" }));
  expect(screen.getByText("Custom pitch")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Redo reset pitch" }));
  expect(screen.getByText("Default pitch")).toBeTruthy();
});
