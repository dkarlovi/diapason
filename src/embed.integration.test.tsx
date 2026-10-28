import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { AppShell } from "./components/AppShell";
import { StudioBoundary, useStudioMode } from "./hooks/useStudioMode";

afterEach(cleanup);
function CaptureRoute() {
  const location = useLocation();
  const { path } = useStudioMode();
  return (
    <>
      <p>Capture {location.search}</p>
      <Link to={path("/recording/take")}>Edit take</Link>
    </>
  );
}
function renderStudio(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudioBoundary>
        <Routes>
          <Route path="/new" element={<CaptureRoute />} />
          <Route
            path="/recording/:id"
            element={
              <>
                <p>Editor</p>
                <Link to="/">Library attempt</Link>
              </>
            }
          />
          <Route path="*" element={<p>Library</p>} />
        </Routes>
      </StudioBoundary>
    </MemoryRouter>,
  );
}
it.each(["/", "/unknown", "/?embed=1"])(
  "redirects embedded %s without rendering Library",
  (route) => {
    renderStudio(route.includes("?") ? route : `${route}?embed=1&afterRecording=edit`);
    expect(screen.queryByText("Library")).toBeNull();
    expect(screen.getByText(/^Capture/).textContent).toContain("embed=1");
  },
);
it("preserves configuration through the editor and a Library route attempt", async () => {
  renderStudio("/new?embed=1&afterRecording=edit");
  await userEvent.click(screen.getByRole("link", { name: "Edit take" }));
  expect(screen.getByText("Editor")).toBeTruthy();
  await userEvent.click(screen.getByRole("link", { name: "Library attempt" }));
  expect(screen.getByText(/^Capture/).textContent).toBe("Capture ?embed=1&afterRecording=edit");
  expect(screen.queryByText("Library")).toBeNull();
});
it("retains the standalone Library", () => {
  renderStudio("/");
  expect(screen.getByText("Library")).toBeTruthy();
});

it("keeps embedded navigation inside a same-origin frame without entering fullscreen", async () => {
  const requestFullscreen = vi.fn(async () => {});
  const enabled = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
  const request = Object.getOwnPropertyDescriptor(document.documentElement, "requestFullscreen");
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  try {
    render(
      <MemoryRouter initialEntries={["/recording/take?embed=1"]}>
        <AppShell>
          <Link to="/new?embed=1">Start over</Link>
        </AppShell>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Start over" }));
    expect(requestFullscreen).not.toHaveBeenCalled();
  } finally {
    if (enabled) Object.defineProperty(document, "fullscreenEnabled", enabled);
    else Reflect.deleteProperty(document, "fullscreenEnabled");
    if (request) Object.defineProperty(document.documentElement, "requestFullscreen", request);
    else Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    vi.unstubAllGlobals();
  }
});
