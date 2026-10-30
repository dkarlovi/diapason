import { render, screen } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { BASE } from "../router";

vi.mock("../Recording/Recording.storage", () => ({ getRecording: async () => undefined }));
beforeEach(() => history.replaceState(null, "", "/diapason/recording/missing"));

it("returns to the library when a recording in the URL no longer exists", async () => {
  render(
    <BrowserRouter basename={BASE}>
      <Routes>
        <Route path="/recording/:id" element={<Editor id="missing" />} />
        <Route path="/" element={<div>Library route</div>} />
      </Routes>
    </BrowserRouter>,
  );
  expect(await screen.findByText("Library route")).toBeTruthy();
  expect(location.pathname).toBe("/diapason/");
});
