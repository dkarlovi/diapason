# Themes and URL color format

[Project overview](../README.md)

For most hosts, start with the [custom element’s CSS properties](embedding.md#match-the-host-page). This reference covers URL options and the packed format for integrations that generate their own links.

- [URL options](#url-options)
- [Packed theme format](#packed-theme-format)
- [JavaScript encoder](#javascript-encoder)
- [Compatibility fixtures](#compatibility-fixtures)
- [Navigation and invalid values](#navigation-and-invalid-values)

The studio generates coordinated light/dark colors from seeds using Material Color
Utilities. Its default is blue & slate with amber playback. Color names elsewhere
in this guide describe that default; custom themes retain the same semantic roles.
No preferences dialog is available yet. Ordinary button and dropdown borders use the
subdued shared border tone, while keyboard focus and active states retain their
stronger accents. Library action menus use borderless rows, and audio/MIDI source
icons share the same neutral background.

## URL options

Both standalone and embed URLs accept:

- `scheme=auto|light|dark`: follow the browser preference (default), or force a
  mode to match the host page. Explicit mode selection also avoids differences in
  how browsers inherit the parent page's appearance into an iframe.
- `theme=<packed colors>`: a versioned, unpadded base64url value, 7–27 characters.
  It stores one to three RGB seeds per light/dark definition, at most six colors.
  A single definition produces both modes. Use the playground to generate the
  packed value; for example, `theme=AQEAcrE` supplies the blue `#0072b1` primary
  seed for both modes.

Primary influences actions, focus, and MIDI notes. Neutral influences quiet
surfaces and text. Secondary influences playback and the original audio trace.
The engine adjusts seed saturation and lightness for coordinated, readable output;
colors are not exact component overrides. Error, warning, and success keep their
semantic families.

Packed colors use only URL-safe characters, without JSON, `#`, or padding:

```js
const url = new URL("https://dkarlovi.github.io/diapason/new");
url.searchParams.set("embed", "1");
url.searchParams.set("scheme", "dark");
url.searchParams.set("theme", "AQEAcrE"); // Blue primary; derive both modes.
// Set your iframe's src to url.href. Delegate "midi", or "microphone; midi" for recording.
```

## Packed theme format

The format is a small binary record, not base64-encoded JSON:

| Byte       | Contents                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `0`        | Version: `0x01`                                                                                |
| `1`        | Presence mask: OR together the flags below for supplied colors                                 |
| `2` onward | One red byte, one green byte, and one blue byte for each present color, in ascending bit order |

| Bit | Flag   | Color slot      |
| --- | ------ | --------------- |
| 0   | `0x01` | Light primary   |
| 1   | `0x02` | Light neutral   |
| 2   | `0x04` | Light secondary |
| 3   | `0x08` | Dark primary    |
| 4   | `0x10` | Dark neutral    |
| 5   | `0x20` | Dark secondary  |

Bits 6 and 7 are reserved and must be zero. At least one mode must supply a
primary. Neutral or secondary requires the primary for that same mode. Omitted
slots contribute no bytes; do not insert zero-filled placeholders. Black
`#000000` is a present color with three zero bytes. If a mode is omitted entirely,
its colors are generated from the other mode's seeds.

Encode the entire byte record as standard base64, replace `+` with `-` and `/`
with `_`, then remove trailing `=` padding. There is no compression or alpha
channel. With `n` supplied colors, the record has `2 + 3n` bytes, giving 7–27
base64url characters for one to six colors. The appearance mode is still the
separate `scheme` query parameter.

For example, light primary `#0072b1` sets mask `0x01` and produces these bytes:

```text
01 01 00 72 b1  →  AQEAcrE
```

## JavaScript encoder

This standalone JavaScript encoder works in browsers and Node.js 22+, without
imports or dependencies. It accepts `#RGB` or `#RRGGBB` seeds:

```js
function packTheme({ light, dark }) {
  const bytes = [1, 0];
  const roles = ["primary", "neutral", "secondary"];

  [light, dark].forEach((mode, modeIndex) => {
    if (mode === undefined) return;
    if (!mode || mode.primary === undefined) {
      throw new Error("Each supplied mode needs a primary seed");
    }
    roles.forEach((role, roleIndex) => {
      const color = mode[role];
      if (color === undefined) return;
      if (typeof color !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
        throw new Error(`Invalid ${role} seed: ${color}`);
      }
      const hex = color.slice(1).replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3");
      bytes[1] |= 1 << (modeIndex * 3 + roleIndex);
      for (let offset = 0; offset < 6; offset += 2) {
        bytes.push(parseInt(hex.slice(offset, offset + 2), 16));
      }
    });
  });

  if (!bytes[1]) throw new Error("Supply at least one primary seed");
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

console.log(packTheme({ light: { primary: "#0072b1" } })); // AQEAcrE

const themedUrl = new URL("https://dkarlovi.github.io/diapason/new");
themedUrl.searchParams.set("embed", "1");
themedUrl.searchParams.set("scheme", "dark");
themedUrl.searchParams.set(
  "theme",
  packTheme({
    light: { primary: "#28714b", neutral: "#657367", secondary: "#a15e35" },
    dark: { primary: "#83c49b" },
  }),
);
// Set your iframe's src to themedUrl.href.
```

## Compatibility fixtures

Additional fixtures for implementations in other languages:

| Supplied colors                                                                                                                 | Packed value                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Dark primary `#000000` only                                                                                                     | `AQgAAAA`                     |
| Light primary/neutral/secondary `#000000`, `#112233`, `#445566`; dark primary/neutral/secondary `#778899`, `#aabbcc`, `#ddeeff` | `AT8AAAARIjNEVWZ3iJmqu8zd7v8` |

The development playground uses the same format and generates ready-to-paste
iframe snippets.

## Navigation and invalid values

For a shared tune, start with its full URL and add these parameters; preserve the
`#tune=...` fragment. Theme parameters survive internal navigation, tune Save,
and refresh. Generated Share links contain musical content and omit appearance.
Themes are not stored in recordings, exports, or undo history.

Malformed packed values, unsupported versions, invalid masks, and values longer
than 27 characters use the app default as a whole. Invalid schemes use `auto`.
JSON theme query values are not accepted.
The [custom element and theme message protocol](embedding.md) update colors live.
Changing an iframe's URL reloads it and interrupts any active recording.

Try [the development embed playground](http://localhost:5173/diapason/dev/embed)
for blue, forest, terracotta, plum, and bright-yellow presets, per-mode seed
pickers, optional neutral/secondary colors, and a light/dark/auto selector. The
surrounding page previews the same theme. **Reload studio** applies the settings
and regenerates an iframe snippet; it reopens the example tune or recording setup.

The [theme specification](superpowers/specs/2026-10-29-seed-themes-design.md)
records the research and design rationale. The generator and semantic mappings
have automated contrast checks; palette generation alone is not a guarantee of
universal aesthetic preference.
