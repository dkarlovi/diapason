import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { useEditorHistoryKeys } from "./useEditorHistoryKeys";
afterEach(cleanup);
function Harness() {
  const [position, set] = useState(1);
  useEditorHistoryKeys({
    enabled: true,
    canUndo: position > 0,
    canRedo: position < 1,
    undo: () => set(0),
    redo: () => set(1),
  });
  return (
    <>
      <output>{position}</output>
      <input aria-label="Name" />
      <input aria-label="Range" type="range" />
      <div contentEditable suppressContentEditableWarning>
        <span>Editable</span>
      </div>
    </>
  );
}
it("supports platform shortcuts while leaving native text editing alone", () => {
  render(<Harness />);
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
  expect(screen.getByText("0")).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "Z", metaKey: true, shiftKey: true });
  expect(screen.getByText("1")).toBeTruthy();
  fireEvent.keyDown(screen.getByLabelText("Name"), { key: "z", ctrlKey: true });
  expect(screen.getByText("1")).toBeTruthy();
  fireEvent.keyDown(screen.getByText("Editable"), { key: "z", ctrlKey: true });
  expect(screen.getByText("1")).toBeTruthy();
  fireEvent.keyDown(screen.getByLabelText("Range"), { key: "z", metaKey: true });
  expect(screen.getByText("0")).toBeTruthy();
  fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
  expect(screen.getByText("1")).toBeTruthy();
});
