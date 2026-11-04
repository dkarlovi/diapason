import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.hoisted(() => vi.stubEnv("BASE_URL", "https://studio.example/diapason/"));
import "./Diapason";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function mount(attributes: Record<string, string> = {}) {
  const element = document.createElement("diapason-studio");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return { element, frame: element.shadowRoot!.querySelector("iframe")! };
}

it("builds a recording iframe with permissions and host metadata", () => {
  const { frame } = mount({ "after-recording": "edit", title: "My studio", loading: "lazy" });
  const url = new URL(frame.src);
  expect(url.pathname).toBe("/diapason/new");
  expect(url.searchParams.get("embed")).toBe("1");
  expect(url.searchParams.get("afterRecording")).toBe("edit");
  expect(frame.allow).toBe("microphone; midi");
  expect(frame.title).toBe("My studio");
  expect(frame.getAttribute("loading")).toBe("lazy");
});

it("builds a tune iframe without microphone delegation and includes CSS seeds on first load", () => {
  const { frame } = mount({
    tune: "example_payload",
    style: "--diapason-primary: #aabbcc; color-scheme: dark",
  });
  const url = new URL(frame.src);
  expect(url.pathname).toBe("/diapason/tune");
  expect(url.hash).toBe("#tune=example_payload");
  expect(url.searchParams.get("theme")).toBe("AQGqu8w");
  expect(url.searchParams.get("scheme")).toBe("dark");
  expect(frame.allow).toBe("midi");
});

it("sends live CSS updates without navigating or replacing the iframe", () => {
  const { element, frame } = mount();
  const src = frame.src;
  const send = vi.spyOn(frame.contentWindow!, "postMessage");
  element.style.setProperty("--diapason-primary", "#aabbcc");
  element.style.colorScheme = "dark";
  vi.advanceTimersByTime(300);
  expect(send).toHaveBeenLastCalledWith(
    { type: "diapason:theme", theme: "AQGqu8w", scheme: "dark" },
    new URL(src).origin,
  );
  expect(frame.src).toBe(src);
  expect(element.shadowRoot!.querySelector("iframe")).toBe(frame);
  element.remove();
  send.mockClear();
  vi.advanceTimersByTime(1000);
  expect(send).not.toHaveBeenCalled();
});

it("forwards metadata changes without loading a new document", () => {
  const { element, frame } = mount();
  const src = frame.src;
  element.title = "Updated title";
  element.setAttribute("loading", "lazy");
  expect(frame.title).toBe("Updated title");
  expect(frame.getAttribute("loading")).toBe("lazy");
  expect(frame.src).toBe(src);
});

it("resends the latest theme only for readiness from its own studio frame", () => {
  const { frame } = mount();
  const send = vi.spyOn(frame.contentWindow!, "postMessage");
  const other = mount().frame;
  for (const [source, origin] of [
    [frame.contentWindow, "https://unrelated.example"],
    [other.contentWindow, "https://studio.example"],
  ] as const) {
    window.dispatchEvent(
      new MessageEvent("message", { source, origin, data: { type: "diapason:ready" } }),
    );
  }
  expect(send).not.toHaveBeenCalled();
  window.dispatchEvent(
    new MessageEvent("message", {
      source: frame.contentWindow,
      origin: "https://studio.example",
      data: { type: "diapason:ready" },
    }),
  );
  expect(send).toHaveBeenCalledWith(
    { type: "diapason:theme", theme: null, scheme: "light" },
    "https://studio.example",
  );
});

it("updates the workflow and permissions when the tune attribute changes", () => {
  const { element, frame } = mount();
  element.setAttribute("tune", "example");
  expect(new URL(frame.src).pathname).toBe("/diapason/tune");
  expect(frame.allow).toBe("midi");
  element.removeAttribute("tune");
  expect(new URL(frame.src).pathname).toBe("/diapason/new");
  expect(frame.allow).toBe("microphone; midi");
});

it("resumes updates on reconnection without duplicating timers", () => {
  const { element, frame } = mount();
  element.remove();
  document.body.append(element);
  const send = vi.spyOn(frame.contentWindow!, "postMessage");
  element.style.setProperty("--diapason-primary", "#aabbcc");
  vi.advanceTimersByTime(1000);
  expect(send).toHaveBeenCalledTimes(1);
});

it("applies workflow changes made while disconnected on reconnection", () => {
  const { element, frame } = mount();
  element.remove();
  element.setAttribute("tune", "changed_offline");
  document.body.append(element);
  expect(new URL(frame.src).pathname).toBe("/diapason/tune");
  expect(new URL(frame.src).hash).toBe("#tune=changed_offline");
  expect(frame.allow).toBe("midi");
});
