import { afterEach, expect, it } from "vitest";
import { readCssTheme } from "./CssTheme";

afterEach(() => document.body.replaceChildren());

it("reads host CSS tokens as packed seeds and follows an explicit color scheme", () => {
  const host = document.createElement("div");
  host.style.cssText =
    "--diapason-primary: rebeccapurple; --diapason-neutral: #fff; color-scheme: dark";
  document.body.append(host);
  expect(readCssTheme(host)).toEqual({
    type: "diapason:theme",
    theme: "AQNmM5n___8",
    scheme: "dark",
  });
});

it("uses default seeds when the primary color is missing or invalid", () => {
  const host = document.createElement("div");
  document.body.append(host);
  expect(readCssTheme(host)).toEqual({ type: "diapason:theme", theme: null, scheme: "light" });
  host.style.setProperty("--diapason-primary", "not-a-color");
  expect(readCssTheme(host).theme).toBeNull();
});
