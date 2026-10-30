import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Capture } from "./Capture";

let rejectMic: ((error: Error) => void) | undefined;
vi.mock("../../Audio/Audio", () => ({
  openMic: () =>
    new Promise((_resolve, reject) => {
      rejectMic = reject;
    }),
  listInputDevices: async () => [],
}));

beforeEach(() => history.replaceState(null, "", "/diapason/new"));

it("leaves capture safely while microphone permission is pending", async () => {
  render(
    <BrowserRouter basename="/diapason">
      <Routes>
        <Route path="/new" element={<Capture />} />
        <Route path="/" element={<div>Library route</div>} />
      </Routes>
    </BrowserRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue with whistling" }));
  expect((screen.getByRole("button", { name: "Connecting…" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await userEvent.click(screen.getByRole("link", { name: /Library/ }));
  expect(await screen.findByText("Library route")).toBeTruthy();
  rejectMic?.(new Error("permission denied"));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
