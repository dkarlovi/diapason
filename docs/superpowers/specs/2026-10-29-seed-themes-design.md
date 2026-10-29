# Seed-based UI themes and embed configuration

Status: implemented on `feature/seed-themes`; packed URL format revised after user review.

Issue: [#44 — Color scheme, customizable for embed](https://github.com/dkarlovi/diapason/issues/44).

## Intent and agreed requirements

Let an embedding site make diapason fit its surroundings by supplying a small
number of colors. People configuring the app should not need to understand color
theory or design a complete palette. The same theme system must cover the full
standalone studio so a preferences dialog can use it later.

The user confirmed that supplied colors are **seeds**: the app may adjust them to
produce readable, coordinated results. Support one to three colors per light/dark
scheme, at most six supplied colors in total. One seed should be enough to get a
complete theme in both modes. Existing color choices may change where that improves
the resulting system.

Preserve the established compact workstation, typography, layout, interactions,
and “the canvas is the work” principle. This is an Operate surface in Impeccable's
terms: successful capture, editing, and export take priority over decoration.

The user requested a specification including the research, decision rationale,
and Impeccable workflow. The detailed API and mappings below are implementation
proposals, not separately confirmed user choices. Review them as part of this spec.

## Research and decision rationale

Sources consulted on 2026-10-29. Distinguish empirical findings, established
engineering systems, and our product-specific judgments; none is a universal
proof of aesthetic quality.

### 1. Color-wheel harmony is an inadequate quality guarantee

[Tan, Echevarria, and Gingold, “Palette-Based Color Harmonization,” IEEE TVCG,
2025](https://cragl.cs.gmu.edu/harmonization/) presents a harmonization framework
and three perceptual studies involving over 1,000 participants. Participants did
not generally prefer harmonized images, and some archetypal harmonic palettes
were judged less harmonious than random palettes.

The experiments concern images and palettes, not complete application interfaces.
They do not establish that all complementary or analogous palettes are bad. They
do undermine the claim that applying a traditional wheel template reliably makes
arbitrary colors attractive.

Decision: do not build the theme generator around a fixed 180-degree complementary
rotation, triads, or a selectable set of harmony formulas. This supersedes the
earlier conversational suggestion to default playback to the primary complement.
Hue relationships may inform individual roles, but must serve the actual studio.

### 2. Perceptual coordinates help, but are not an aesthetic scoring function

[W3C CSS Color 4, Oklab and OkLCh](https://www.w3.org/TR/css-color-4/#ok-lab)
describes a perceptual color space with improved hue and chroma uniformity.
This makes it useful for mixing and comparing colors. Equal HSL lightness or hue
steps are not equivalent perceptual steps.

Decision: avoid naive RGB channel arithmetic and HSL shade ladders. Continue
using perceptual CSS mixing where appropriate. OKLCH does not have to be our
palette engine: perceptual coordinate systems and complete theme-generation
algorithms solve different problems.

### 3. Material Color Utilities supplies a practical seed-to-theme engine

[Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
provides open-source color algorithms and a TypeScript implementation. Its
[scheme-generation explanation](https://github.com/material-foundation/material-color-utilities/blob/main/concepts/scheme_generation.md)
describes assigning semantic roles, setting hue/chroma and tone, resolving
unachievable colors, maintaining tone relationships, and adjusting foreground
tones for contrast against their assigned backgrounds.

Its HCT model combines hue, chroma, and perceptual tone; it is distinct from
OKLCH. A dynamic scheme encodes more than a palette of attractive swatches: it
also describes which colors belong together as foreground/background pairs.

Decision: use Material Color Utilities as the proposed runtime engine. Start
the visual evaluation with its restrained Tonal Spot variant, rather than
selecting an expressive variant or preserving maximum saturation by default.
Use its semantic scheme generation, not just its raw tonal palettes.

This is an engineering choice based on its fit to our requirements, not a claim
that it is the scientifically best or only state-of-the-art system. We use the
color utilities without adopting Material components, typography, spacing, or
layout. Measure the dependency's actual production bundle impact before accepting
the implementation; use the necessary exports rather than importing unrelated
image extraction or quantization functionality.

### 4. Radix offers a credible alternative built around designed UI scales

[Radix custom palettes](https://www.radix-ui.com/colors/docs/overview/custom-palettes)
generates custom scales from reference colors, based on its existing scales.
[Radix's color system](https://www.radix-ui.com/themes/docs/theme/color) assigns
scale steps to backgrounds, component states, borders, solid fills, and text.
The custom-palette documentation qualifies comparable contrast behavior on using
a reasonable background color; it is not an arbitrary-input guarantee.

Radix is an attractive alternative for retaining a restrained web-tool appearance.
However, its documented custom workflow generates CSS to paste into a project;
runtime seed integration requires adapting its generator. Material Color Utilities
offers the more direct runtime scheme engine for this feature.

Decision: keep Radix as the fallback approach if the Material-based trial cannot
meet our visual or bundle requirements. Our existing use of Radix popovers does
not require us to adopt Radix Colors or Radix Themes.

### 5. Quality comes from generation, constraints, and verification together

Use [WCAG 2.2 contrast requirements](https://www.w3.org/TR/WCAG22/#contrast-minimum)
for text and [non-text contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
for relevant controls and state indicators. Do not equate a perceptual color
difference with a contrast ratio or assume a generator's role guarantees survive
arbitrary remapping and translucent overlays.

Decision: validate resolved colors in the combinations we actually render, then
review real screens with Impeccable. We can test readability and consistency;
visual judgment still determines whether the studio looks balanced and coherent.

## Approaches considered

1. **Custom OKLCH ramps and color-wheel rules.** Small and flexible, but makes us
   responsible for gamut handling, role relationships, light/dark composition,
   contrast, and aesthetic tuning. Not selected as the main engine.
2. **Material Color Utilities with diapason role mappings.** Selected proposal:
   established runtime generation, semantic pairings, and coordinated schemes.
   Requires careful mapping and visual review to preserve the workstation's feel.
3. **Radix custom-scale generation.** Strong UI-specific scales and a fitting
   visual character, but requires adapting the generator for runtime seeds.
   Retain as a fallback rather than implementing two engines.

## Theme model and configuration proposal

Expose palette intent rather than individual component colors. Each supplied
mode has a required `primary` seed and optional `neutral` and `secondary` seeds:

```ts
interface ThemeSeeds {
  primary: string;
  neutral?: string;
  secondary?: string;
}

interface StudioTheme {
  light?: ThemeSeeds;
  dark?: ThemeSeeds;
}

type ColorScheme = "auto" | "light" | "dark";
```

- `primary` influences actions, selected states, focus, and interpreted MIDI notes.
- `neutral` influences the hue/character of surfaces and text, with restrained
  chroma. It is not an exact background or text-color override.
- `secondary` influences the contrasting playback/original-performance role.
  Without it, use the scheme's coordinated secondary/tertiary relationships and
  verify that audio, MIDI, selection, and playback remain distinguishable.
- A single mode's seeds generate both modes when the other mode is absent. This
  reuses the seeds and generates a separate dark/light scheme; it does not invert
  the resulting RGB colors. Supplying both modes allows up to six seed colors.
- With no configuration, use a built-in blue/slate seed definition through the
  same generation path. Exact legacy colors are not a compatibility promise.

Inputs are inspirations, not output tokens. Normalize saturation and tone for
each role. Do not expose arbitrary semantic-token overrides in this version.

For custom neutral and secondary seeds, derive their tonal palettes with the
engine and integrate them before dynamic role/contrast resolution. Do not replace
final scheme colors afterward, which would invalidate their pair relationships.
The implementation plan must identify the supported library extension point and
verify that it retains global tone and contrast constraints.

## URL API proposal

Use `theme=<packed colors>` and a separate `scheme=auto|light|dark` parameter.
Support these on standalone and embedded routes. The user requested packed colors
instead of the initial JSON proposal after reviewing the implemented theme UI.
Keep `StudioTheme` as the internal typed model, but serialize RGB bytes directly.
This avoids transmitting property names, punctuation, and URL-escaped hex markers;
the known six color slots need only a presence mask.

Version 1 wire format:

| Bytes    | Meaning                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0        | Version, currently `1`                                                                                                       |
| 1        | Presence mask: bits 0–2 light primary/neutral/secondary; bits 3–5 dark primary/neutral/secondary; bits 6–7 reserved and zero |
| 2 onward | Three RGB bytes for each present slot, in bit order; no alpha                                                                |

Encode as canonical, unpadded base64url (`A–Z`, `a–z`, `0–9`, `-`, `_`). A
single primary is five bytes / seven characters; all six colors are twenty bytes /
twenty-seven characters. A mode's optional seeds require its primary bit. At least
one primary must be present. Missing modes reuse the supplied mode's seeds as
before. Example: `theme=AQEAcrE` decodes to light primary `#0072b1`, also used to
generate the dark scheme.

Use a shared canonical base64url primitive for tunes and themes, with separate
size limits. The theme parser checks the 27-character bound before decoding,
rejects padding/noncanonical trailing bits, unsupported versions, reserved bits,
optional seeds without a primary, truncation, and extra bytes. Any invalid payload
falls back as a whole; it does not interrupt the studio. JSON query values are no
longer accepted. `encodeTheme` accepts opaque `#RGB`/`#RRGGBB` seeds, normalizes
short hex, and rejects invalid seed definitions before packing.

Build URLs with `URL` and `URLSearchParams`; preserve existing `#tune=...` fragments
and the `/diapason/` base path. The playground calls the same encoder as application
navigation so its snippets exercise the production format. An invalid scheme falls
back to `auto`. No configuration error requires an intrusive notice.

Keep the active theme as entry configuration, following `StudioBoundary`'s
existing embed behavior. Preserve its normalized query parameters across capture,
editor navigation, redirects, embedded tune Save/promotion, and refresh. A later
preferences UI may update the theme state, but is outside this implementation.

`auto` follows the browser's color-scheme preference. Explicit `light` or `dark`
sets the document's effective scheme regardless of the system preference. Expose
this override because iframe behavior varies across browsers; do not assume an
iframe can always infer its host's chosen theme. See the relevant
[color-scheme specification](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-prop).

Theme configuration is presentation state, not musical content. Do not put it in
portable tune payloads, recordings, undo history, MIDI, or WAV metadata. Ordinary
Share links remain about the tune and omit the host's appearance configuration;
hosts can explicitly add theme parameters to their iframe URL.

No parent-window messaging protocol or live host-theme synchronization is added.
Hosts can construct a themed iframe URL; changing that URL reloads the iframe and
has the normal implications for any ongoing recording or temporary work.

## Architecture and semantic roles

Separate pure theme parsing/generation from React/browser effects. Produce a
complete resolved token set for both modes, with one owner for applying the active
theme and scheme. Keep React-specific lifecycle work in a hook/boundary.

Map onto the existing `--color-*` tokens in `src/theme.css` and `--trace-*` canvas
palette. Make foreground/background pair mappings explicit in code/documentation.
Primary fill text and primary-colored text on a surface may need different tones;
introduce a reusable text-accent token if one color cannot satisfy both contexts.

Preserve semantic meanings: destructive/error stays recognizable, success remains
confirmation, and warning remains caution. These are controlled semantic families,
not unrestricted rotations of the brand seed. Playback has its own role and need
not remain an alias of warning. Preserve labels, icons, outlines, stripes, and
other existing non-color cues.

Cover controls, backgrounds, surfaces, borders, secondary text, hover/focus/active
states, selection, overlays, native controls, and chart tokens. Audit legacy
colors in `src/styles.css` and renderer fallbacks for reachable leaks, rather than
rewriting unrelated styling. Portaled menus and viewport/browser surfaces must
receive the same effective theme as the workstation.

Saved chart layers must invalidate their resolved palette when seeds or the
effective scheme change. `src/trace.ts` currently caches colors partly using the
system dark preference; that is insufficient for a forced scheme or a new seed.
Ensure canvas and DOM update together. Live monitoring must retain its existing
drawing lifecycle; do not introduce per-frame generation or DOM color probes.

Generate/cache tokens only when configuration changes. Do not let theming alter
recordings, musical settings, playback timing, or audio processing.

## Impeccable and implementation workflow

The skill was found at `~/.github/skills/impeccable/SKILL.md` in this environment.
Resolve its actual installation path in future sessions; do not assume it lives
in this repository or copy its binary into production.

1. **Load context once per implementation session.** Run the installed
   `scripts/impeccable context --target src/theme.css` with cwd at this project.
   Read `PRODUCT.md`, `DESIGN.md`, `docs/design-principles.md`, matching surface
   briefs, and current source. This session already loaded context. Treat stale
   product claims as context to reconcile with implemented behavior, not permission
   to remove current features. Do not repair unrelated Impeccable configuration
   drift as part of theming.
2. **Resolve design intent.** Use the `colorize` and `extract` playbooks for the
   existing color roles/token system and `operate` guidance for the workstation.
   Keep surfaces quiet and hierarchy deliberate. This is system expansion, not
   permission to redesign composition, typography, or product copy.
3. **Evaluate the engine in the actual UI.** Use a small runnable code prototype
   or development-only theme fixture, reusing current capture/editor/library
   components and realistic tunes. Compare the default and several difficult
   seed themes in both modes, including a host page around the iframe. Inspect
   rendered screenshots and interactions, not only swatches. If the selected
   variant fails, tune its role mapping/constraints before changing engines.
   Confirm the resulting visual direction with the user before broad rollout.
4. **Read the Impeccable craft floor immediately before UI edits.** Follow its
   applicable quality requirements and the project's pinned visual agreements.
   Resolve the source of contrast or hierarchy defects at the token/mapping level
   instead of adding theme-specific component patches.
5. **Plan and implement the approved design.** Write an implementation plan with
   vertical slices for generation, application/canvas integration, embed routing,
   and verification/documentation. Keep parsing and color assertions unit-testable.
   Use the repository's React/TypeScript conventions and modern web guidance.
6. **Review technical and visual quality.** Use Impeccable `audit` for verified
   accessibility, theming, responsive, and implementation findings; it reports
   defects rather than fixing them. Use `critique` when visual hierarchy/coherence
   needs assessment, then `polish` for scoped corrections. Batch findings and
   fixes between rendered inspections. A clean detector or audit is not proof
   that the result looks good. Follow the skill's active detector/hook instructions
   without adding redundant detector passes.
7. **Document and hand off.** Update `README.md`, `DESIGN.md`,
   `.impeccable/design.json`, and color-specific design agreements to describe the
   resulting semantic system and default. Add screenshots for visible changes.
   Keep durable design documents about the shipped system; exploration stays in
   development fixtures or clearly marked prototype artifacts.

Pastel is a development aid for inspecting colors, OKLab mixes, readable text
candidates, and color-vision simulations. The installed `rotate` command operates
in HSL, so its hue rotations are not equivalent to HCT/OKLCH generation. It is
neither a runtime dependency nor evidence of accessibility or aesthetic quality.

## Verification and acceptance criteria

### Behavior and integration

- The default app and each valid custom seed configuration theme all three
  screens, their menus/popovers, and both live and saved canvases consistently.
- A single seed produces coordinated light and dark output. Per-mode neutral and
  secondary seeds influence their intended roles without breaking contrast.
- `auto` reacts to system changes; forced modes remain stable when the system
  changes. The theme application path can replace a configuration without stale
  chart colors, even though no preferences controls ship yet.
- Theme parameters survive recording-to-editor transitions, legacy tune-fragment
  redirects, embedded tune promotion to a saved recording, and refresh. Existing
  `embed`, `afterRecording`, and `tuneEmbed` behavior remains intact.
- Invalid/oversized configuration safely uses the default theme; recording,
  playback, editing, Save, and exports continue to work.
- Independent iframes may use different themes without affecting one another or
  the parent page. Browser code does not require cross-origin DOM access.

### Color and visual evaluation

- Test seeds across the hue circle, plus saturated yellow, lime, red, blue,
  near-white, near-black, and achromatic gray. Include awkward combinations of
  primary, neutral, and secondary seeds, and independently configured modes.
- Assert finite, valid, reproducible resolved colors and test the actual semantic
  pairings. Text uses at least 4.5:1 contrast for normal text or 3:1 where the WCAG
  large-text criterion actually applies. Relevant control/state/focus indicators
  meet 3:1 against adjacent colors. Treat disabled and decorative elements using
  the standard's actual exceptions rather than misreporting failures.
- Check rendered hover, focus, pressed, selected, playback, error, muted-note,
  edited-note, and overlay states, including mixed/translucent backgrounds. Test
  high-contrast/forced-colors behavior and preserve meaningful non-color cues.
- Review representative desktop and mobile/narrow iframe sizes in light/dark;
  exercise important paths in Chromium, Firefox, and Safari where available.
  Disclose unavailable browser coverage instead of claiming it passed.
- Inspect color-vision simulations of screenshots. Numeric palette distances and
  simulated swatches alone do not establish distinguishable notes or controls.
- Save representative screenshots with the seed values, effective scheme, route,
  and viewport so results are reviewable and reproducible. Broader seed coverage
  can be automated; the visual review matrix should remain small and deliberate.

### Developer experience and completion

- Extend `dev/embed.html` with seed and scheme inputs, useful example palettes,
  and a correctly encoded iframe snippet for both capture and tune examples.
  The playground explains that Reload studio reloads the frame.
- Add focused parsing/generation and route/promotion regressions. Use real browser
  computed colors for CSS/DOM/canvas validation; jsdom alone is insufficient.
- Run focused checks and `npm run check` before submitting implementation. Measure
  the production bundle change and confirm that theme generation adds no work to
  the animation/audio hot paths.
- Document URL examples, defaults, seed adjustment, invalid-input behavior, mode
  selection, and limitations in README. Remove fixed Slate & blue assertions
  where they incorrectly describe every custom theme.

## Out of scope and remaining implementation decisions

No preferences dialog, named-theme gallery, persistent user preferences, theme
marketplace, AI palette generation, image-derived seeds, new analytics, server
processing, or host messaging protocol. The application remains fully client-side.

The builder chooses exact module boundaries, library version, scheme extension
mechanics, semantic role mappings, gamut/output representation, caching strategy,
and visual-test tooling within these constraints. Record those choices in the
implementation plan. In particular, confirm optional seed integration and bundle
cost early; raise a material mismatch with this spec rather than silently dropping
custom neutral/secondary inputs or changing the engine.
