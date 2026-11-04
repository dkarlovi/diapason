import { expect, it } from "vitest";
import { readThemeMessage } from "./ThemeMessage";

it("validates theme updates and supports an explicit reset to defaults", () => {
  expect(readThemeMessage({ type: "diapason:theme", theme: "AQGqu8w", scheme: "dark" })).toEqual({
    theme: { light: { primary: "#aabbcc" } },
    scheme: "dark",
  });
  expect(readThemeMessage({ type: "diapason:theme", theme: null, scheme: "auto" })).toEqual({
    theme: undefined,
    scheme: "auto",
  });
});

it.each([
  null,
  [],
  { type: "unrelated", theme: null, scheme: "light" },
  { type: "diapason:theme", theme: "bad", scheme: "light" },
  { type: "diapason:theme", theme: null, scheme: "sepia" },
  { type: "diapason:theme", scheme: "dark" },
])("ignores malformed theme updates: %j", (message) => {
  expect(readThemeMessage(message)).toBeUndefined();
});
