import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserRouter, Link } from "react-router";
import { useStudioFullscreen } from "./useStudioFullscreen";

function Studio() {
  const fullscreen = useStudioFullscreen();
  return (
    <main onClickCapture={fullscreen.onNavigate}>
      <Link to="/new">New</Link>
      <Link to="/recording/one">Edit</Link>
      <Link to="/">Library</Link>
    </main>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function setup(mobile = true) {
  history.replaceState(null, "", "/diapason/");
  vi.stubGlobal("matchMedia", () => ({ matches: mobile }));
  const request = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  render(
    <BrowserRouter basename="/diapason">
      <Studio />
    </BrowserRouter>,
  );
  return request;
}
it.each(["New", "Edit"])("requests fullscreen during mobile %s navigation", (name) => {
  const request = setup();
  fireEvent.click(screen.getByRole("link", { name }));
  expect(request).toHaveBeenCalledOnce();
  expect(location.pathname).toMatch(/\/diapason\/(new|recording\/one)/);
});
it("leaves desktop and modified navigation alone", () => {
  const request = setup(false);
  fireEvent.click(screen.getByRole("link", { name: "New" }));
  expect(request).not.toHaveBeenCalled();
});
it("ignores modified links and Library navigation", () => {
  const request = setup();
  fireEvent.click(screen.getByRole("link", { name: "New" }), { ctrlKey: true });
  fireEvent.click(screen.getByRole("link", { name: "Library" }));
  expect(request).not.toHaveBeenCalled();
});
it("continues navigation when fullscreen is denied", async () => {
  const request = setup();
  request.mockRejectedValue(new Error("Denied"));
  fireEvent.click(screen.getByRole("link", { name: "Edit" }));
  await Promise.resolve();
  expect(location.pathname).toBe("/diapason/recording/one");
});
