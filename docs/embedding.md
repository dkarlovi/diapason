# Embed diapason

[Project overview](../README.md)

Use the custom element for a CSS-themed studio, or an iframe for direct URL control. See [theme encoding](themes.md) for custom URL palettes.

- [Match the host page](#match-the-host-page)
- [Live theme messages](#live-theme-messages)
- [Direct iframe integration](#direct-iframe-integration)
- [Permissions and storage](#permissions-and-storage)
- [Test an integration](#test-an-integration)

Load `diapason.js` once, then use the native `<diapason-studio>` element:

```html
<script type="module" src="https://dkarlovi.github.io/diapason/diapason.js"></script>

<diapason-studio
  after-recording="edit"
  title="Whistle-to-MIDI studio"
  loading="lazy"
></diapason-studio>

<!-- For an editor, set tune to the payload after #tune= in a shared URL. -->
<diapason-studio tune="RFBTTgEC…" title="My tune"></diapason-studio>
```

## Match the host page

Map the host's existing CSS tokens to the element. No theme encoder or host
JavaScript is needed:

```css
:root {
  color-scheme: light dark;
}

diapason-studio {
  --diapason-primary: var(--accent);
  --diapason-neutral: var(--paper);
  --diapason-secondary: var(--accent-2); /* Optional. */
  max-width: 50rem;
  min-height: 26rem;
}

/* A studio in a dark hero can inherit this from its surroundings. */
.hero {
  color-scheme: dark;
}
```

`--diapason-primary` enables a custom palette; neutral and secondary are optional.
Colors accept CSS color syntax, including named colors, `rgb()`, `oklch()`, and
`light-dark()`. Seeds are converted to sRGB; alpha is discarded. Missing or invalid
primary colors use the studio's default palette. The element inherits `color-scheme`;
`light` or `dark` forces that mode, while `light dark` or `normal` follows the
visitor's preference. The example inherits the page's choice, including a dark hero.

Ancestor palette changes, stylesheet changes, and media queries update the studio
live, without navigating the iframe or interrupting recording or edits. Computed
styles are checked every 250 ms while the page is visible; preference changes also
apply immediately. CSS dimensions size the element and its iframe together; the
default is full width with a 12:7 aspect ratio. `title` and `loading` are forwarded
to the iframe (`loading` defaults to `eager`). Changing `tune` or `after-recording`
loads the requested workflow and discards unsaved work in that frame.

The element delegates MIDI permission automatically and microphone permission for
recording studios. The HTTPS, browser permission, host policy, and storage notes
below still apply. Existing iframe integrations continue to work.

## Live theme messages

For a direct iframe integration with its own host script, the embedded studio
announces `{ type: "diapason:ready" }` to its parent after installing the theme
listener. Send `{ type: "diapason:theme", theme, scheme }` to that iframe's window,
using the studio origin as `postMessage`'s target origin. `theme` is the existing
packed `theme=` string, or `null` to restore the default palette; `scheme` is
`"light"`, `"dark"`, or `"auto"`. The studio accepts valid messages only from its
parent. The element handles this exchange automatically.

## Direct iframe integration

Embed the recording studio in a lesson or songwriting page:

```html
<iframe
  src="https://dkarlovi.github.io/diapason/new?embed=1&amp;afterRecording=edit"
  title="Whistle-to-MIDI studio"
  allow="microphone; midi"
  width="720"
  height="420"
></iframe>
```

- `embed=1` removes the header and Library navigation. Recording embeds redirect Library
  and unknown routes to New recording; tune embeds stay on their specific tune. The logo sits beside the canvas labels
  in capture and editing. This is a workflow restriction, not storage isolation.
- `afterRecording=edit` opens the Editor only after a recording saves successfully.
  Without it, the studio stays ready for another take. This option also works without embedded mode.
- Both settings survive internal navigation, deletion, and starting
  another recording. Omit both to retain the standalone experience.

To embed a specific tune, use its shared URL with `embed=1` before the fragment:

```html
<iframe
  src="https://dkarlovi.github.io/diapason/tune?embed=1#tune=RFBTTgEBABJGbHkgbWUgdG8gdGhlIG1vb27AhAEAAAAAAMBbQAQCABs5rzGxRptNQCDLRqfjjllACAACIAEA4AN5L3lXoclWQAGLBMAC4LT7L3X1VkABwALqATQonEConlZAAeoBqwLdXOG4WxxWQAWWA7UDGve7bqS7VUBWAdUDqwPz50GBZyNVQAWABMADdaztr3vAVUBWAesD4ANMaMpvkiFWQAWVBKAEJfRq0nMZV0BbAaAEgAFis2uz1YZWQAWAAdUGajAqKq_AVkBaAfUHwAFn0YytHiFWQAXgAaACCIAqXRO6VUBWAesCdeibVJdKYVVAAXXrASWyqCgoIlVAAeAClgVASAJabr9UQAHgEusDJxv_AqwBVkABiwTAAugJaxAaCFZAAcAC9QHye8038ZFVQAH1AZYBSkA3qU4vVUABlgGqAe89jrQqIVVAAdUBlQN5hjcrLNZUQAHrA7UDBr22rQVAVEAB4AOqA6hrfoWFBVVAAaAEwAPqXjJQEUpVQAGVBNUFYvEfDmcjVkAB4AarA6D7lgitx1VAAZUEqwLsHlA-mr5VQAHLAusB6Px-C0ApVUAB6wGqAlSh_AxT1FRAAYAD6gLjTIrM3GpUQAHABVVuYkHihuRTQA"
  title="Fly me to the moon tune editor"
  allow="midi"
  width="720"
  height="420"
></iframe>
```

Tune embeds start directly in the editor and need no microphone delegation.
Show original and Trace overlay controls are hidden for embedded tunes without audio.
The visitor can play, edit, export, or **Save** from the actions dropdown. Capture and
Library navigation are unavailable, including after Save opens the recording
editor. The saved URL preserves `embed=1&tuneEmbed=1`; hosts do not need to add
`tuneEmbed` to the original tune link. Delete and Duplicate are unavailable in
this workflow. Existing root `/#tune=...` links also open directly in the editor.

Use a landscape-shaped frame; 720 × 420 is a useful starting point. Setup and
Tune scroll within the frame. Audio/MIDI playback, editing and MIDI downloads use
existing controls. For recording embeds, the menu beside MIDI Download contains MIDI output selection,
Reset edits, and Delete recording. Deleting returns to New recording inside the
iframe. WAV import and standalone recording management menus are unavailable in embedded
mode.

## Permissions and storage

The host and studio must use HTTPS (localhost is allowed for development).
Direct iframe embeds must delegate MIDI with `allow="midi"`; recording embeds need
`allow="microphone; midi"`. If the host sends a `Permissions-Policy` header, its
`microphone` and `midi` policies must allow the studio origin too; the
iframe attribute cannot override a restrictive header. Visitors must still grant
browser microphone permission. Playback starts from a visitor action. Downloads
also require a visitor action and may be restricted by browser or host policy.
Prefer an unsandboxed iframe. If the host uses `sandbox`, the workflow needs
`allow-scripts allow-same-origin allow-downloads`; browser confirmation dialogs
also need `allow-modals`.

Recordings stay in the embedded origin's IndexedDB. Browser privacy settings may
partition or block third-party storage; embed mode does not transfer recordings
or MIDI to the parent page. Download files to keep a portable copy.

## Test an integration

For local testing, run `npm run dev` and open
[the CSS element example](http://localhost:5173/diapason/dev/studio.html) or
[the dev-only embed playground](http://localhost:5173/diapason/dev/embed).
It opens with the “Fly me to the moon” editor embed and offers a recording/editor
mode selector, resizable iframe, width/height fields, automatic Editor and
microphone delegation toggles, and a cross-origin test using localhost and
127.0.0.1, plus [theme presets and seed controls](themes.md). Reload the frame after changing permissions. The playground is served
only by Vite's dev server and is absent from production builds. Test on a separate
HTTPS host before deployment to confirm its permission and download policies.
