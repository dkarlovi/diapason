import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { beforeEach, expect, it } from "vitest";
import { recordingPath } from "./router";

beforeEach(() => history.replaceState(null, "", "/diapason/"));

it("opens an editor through a path URL", async () => {
  render(
    <BrowserRouter basename="/diapason">
      <Routes>
        <Route path="/" element={<Link to={recordingPath("first")}>Open recording</Link>} />
        <Route path="/recording/:id" element={<div>Editor route</div>} />
      </Routes>
    </BrowserRouter>,
  );
  await userEvent.click(screen.getByRole("link", { name: "Open recording" }));
  expect(await screen.findByText("Editor route")).toBeTruthy();
  expect(location.pathname).toBe("/diapason/recording/first");
});
