# diapason

Whistle into your microphone, shape the melody, and download a MIDI file.
diapason is a browser-based, monophonic whistle-to-MIDI studio for people who can
carry a tune without playing an instrument.

**[Open diapason](https://dkarlovi.github.io/diapason/)**

Recordings and processing stay in your browser. No account or upload is required.

## What you can do

- Record with guided microphone calibration, a metronome, and tap or clap tempo.
- Keep takes in a local library and compare the original audio with a MIDI piano roll.
- Preview melody presets, shape pitch, rhythm and glides, edit or mute notes, and save versions.
- Play through the browser synth or an external MIDI device when Web MIDI is available.
- Share editable tune links, download MIDI, or export a WAV package to restore a take.
- Embed the recording studio or a shared tune in another website.

Whistling is the supported input. Detection handles one note at a time; automatic
correction can misread your intent. Import accepts Diapason's own WAV and MIDI
exports. Recordings stay in this browser, so export files to keep a portable copy.
See [supported inputs and limitations](docs/limitations.md).

## Run locally

Requires Node.js 22.18+.

```bash
npm ci
npm run dev
```

Open <http://localhost:5173/diapason/>. Microphone access requires localhost or HTTPS.
Use `npm run build` for a production build and `npm run check` for the full checks.

## Documentation

| I want to…                                  | Read                                                 |
| ------------------------------------------- | ---------------------------------------------------- |
| Record, tune, and edit a melody             | [Studio guide](docs/studio-guide.md)                 |
| Share a tune or restore a recording         | [Sharing, export, and restoration](docs/sharing.md)  |
| Put diapason on my website                  | [Embedding](docs/embedding.md)                       |
| Customize colors or generate theme URLs     | [Themes](docs/themes.md)                             |
| Set up checks, contribute, or deploy        | [Development](docs/development.md)                   |
| Understand the processing and source layout | [Architecture](docs/architecture.md)                 |
| Investigate a recording with the CLI        | [Recording inspection](docs/recording-inspection.md) |

Product intent lives in [PRODUCT.md](PRODUCT.md); interface guidance lives in
[DESIGN.md](DESIGN.md). Coding agents should start with [AGENTS.md](AGENTS.md) and
use the [recording investigation skill](.agents/skills/diapason-recordings/SKILL.md)
when working with a supplied WAV.

Report bugs and follow planned work in [GitHub issues](https://github.com/dkarlovi/diapason/issues).
