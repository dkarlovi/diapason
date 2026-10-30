# CLI setup and disposable cache

Load for a missing CLI/dependency, runtime error, cache concern, or a request for a
fresh detector execution.

Run from the diapason checkout containing `bin/diapason`. Use an absolute WAV path
when changing directories. Node `22.12+` and locked development dependencies are
required; use the repository's `npm ci` setup when dependencies are absent. This
CLI loads application TypeScript through Vite; no separate CLI build is required.
Vite writes temporary loader files under `node_modules/.vite-temp`, so the checkout
must permit those development-runtime writes even with `--no-cache`. An `EROFS` or
`EACCES` at that path is a workspace permission problem, not a damaged recording;
resolve it through the environment's normal permission mechanism or a writable
checkout. Do not rewrite the WAV or bypass the CLI to work around it.
Do not start the browser app or ask for microphone permission to inspect a file.

Use `bin/diapason --help` and `bin/diapason <command> --help` to resolve supported
commands/flags. Help does not require opening a recording. A missing CLI or older
checkout is a setup/version issue, not evidence that the WAV is damaged.

```sh
bin/diapason verify '/path/to/recording.wav' --no-cache --json
bin/diapason cache status '/path/to/recording.wav' --json
bin/diapason cache status --cache-dir '/tmp/diapason-review-cache' --json
```

`--no-cache` bypasses investigation-cache reads and writes; use it when claiming fresh detector
execution. Ordinary runs may reuse acoustics and validated interpretation/export
snapshots; inspect `data.provenance` in verification JSON. Cache reuse is not new
detector evidence. Every invocation still hashes/validates the actual WAV and
checks source non-mutation. Different WAV metadata/edits distinguish packages even
when PCM matches; acoustic frame reuse has its own dependency key.

Default storage is owner-private `os.tmpdir()/diapason-<uid>/cache/v1`, with seven
idle days and a 1 GiB bound. `--cache-dir` overrides it. Cache failures fall back
to computation with diagnostics on stderr; clearing is not a routine prerequisite.

For a requested cleanup, `bin/diapason cache clear '<wav>'` selects that package,
or omit the WAV for the whole chosen cache. Pass the same `--cache-dir` if one was
used. Shared acoustic entries may then recompute for other packages too. This
removes disposable computation entries, not recordings or durable exports; do not
substitute broad filesystem deletion commands.
