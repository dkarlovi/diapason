import { expect, it } from "vitest";
import { encodeTheme, parseColorScheme, parseTheme, type StudioTheme } from "./theme-config";

it.each([
  ["AQEAcrE", { light: { primary: "#0072b1" } }],
  ["AQGqu8w", { light: { primary: "#aabbcc" } }],
  ["AQgAAAA", { dark: { primary: "#000000" } }],
  [
    "AT8AAAARIjNEVWZ3iJmqu8zd7v8",
    {
      light: { primary: "#000000", neutral: "#112233", secondary: "#445566" },
      dark: { primary: "#778899", neutral: "#aabbcc", secondary: "#ddeeff" },
    },
  ],
] as const)("reads and writes the literal packed fixture %s", (packed, theme) => {
  expect(parseTheme(packed)).toEqual(theme);
  expect(encodeTheme(theme)).toBe(packed);
});

it("normalizes short hex before packing", () => {
  expect(encodeTheme({ light: { primary: "#AbC" } })).toBe("AQGqu8w");
});

it.each([
  null,
  "",
  "{",
  "null",
  "AQ",
  "AQAAAAA",
  "AQIAAAA",
  "AUEAAAA",
  "AgEAcrE",
  "AQEAcrEA",
  "AQEAcr",
  "AQEAcrE=",
  "AQEAcrF",
  "AQEAcr+",
  "AQEAcr/",
  "a".repeat(28),
  '{"light":{"primary":"#0072b1"}}',
])("falls back for an invalid packed theme: %s", (input) => {
  expect(parseTheme(input)).toBeUndefined();
});

it("round-trips all optional-seed shapes without losing missing modes or zero-valued colors", () => {
  const variants = [
    undefined,
    { primary: "#000000" },
    { primary: "#ffffff", neutral: "#000000" },
    { primary: "#000000", secondary: "#ffffff" },
    { primary: "#123456", neutral: "#789abc", secondary: "#def012" },
  ];
  for (const light of variants)
    for (const dark of variants) {
      if (!light && !dark) continue;
      const theme: StudioTheme = { ...(light ? { light } : {}), ...(dark ? { dark } : {}) };
      const packed = encodeTheme(theme);
      expect(packed).toMatch(/^[A-Za-z0-9_-]{7,27}$/);
      expect(parseTheme(packed)).toEqual(theme);
    }
});

it.each([
  {},
  { light: {} },
  { light: { primary: "red" } },
  { light: { primary: "#1234" } },
  { light: { primary: "#123", neutral: null } },
])("rejects invalid seeds at the encoder boundary", (theme) => {
  expect(() => encodeTheme(theme as StudioTheme)).toThrow();
});

it.each([
  [null, "auto"],
  ["invalid", "auto"],
  ["auto", "auto"],
  ["dark", "dark"],
  ["light", "light"],
])("resolves scheme %s as %s", (input, expected) => {
  expect(parseColorScheme(input)).toBe(expected);
});
