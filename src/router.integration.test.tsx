import { act, render, screen } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it } from "vitest";
import { go, takePath } from "./router";

beforeEach(() => history.replaceState(null, "", "/diapason/"));

it("updates the rendered route when recording opens a take", async () => {
  render(
    <BrowserRouter basename="/diapason">
      <Routes>
        <Route path="/" element={<div>Library route</div>} />
        <Route path="/take/:id" element={<div>Editor route</div>} />
      </Routes>
    </BrowserRouter>,
  );
  expect(screen.getByText("Library route")).toBeTruthy();
  act(() => go(takePath("first")));
  expect(await screen.findByText("Editor route")).toBeTruthy();
});
