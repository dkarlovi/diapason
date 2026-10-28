import { createServer } from "vite";
const server = await createServer({
  mode: "replay",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: "custom",
});
try {
  const { loadFixture } = await server.ssrLoadModule("/src/test-support/fixtures.ts");
  const { createPortableTune } = await server.ssrLoadModule("/src/portable-tune.ts");
  const { packTune } = await server.ssrLoadModule("/src/tune-fields.ts");
  const { encodeTune, toBase64Url } = await server.ssrLoadModule("/src/tune-codec.ts");
  const { noteRecording } = await server.ssrLoadModule("/src/test-support/note-recording.ts");
  const rows = [];
  async function measure(name, tune) {
    const raw = packTune(tune),
      encoded = await encodeTune(tune);
    rows.push({
      name,
      notes: tune.noteSource.segments.length,
      json: new TextEncoder().encode(JSON.stringify(tune)).length,
      packed: raw.length,
      encoded: encoded.length,
      urlCharacters:
        "https://dkarlovi.github.io/diapason/#tune=".length + toBase64Url(encoded).length,
    });
  }
  for (const name of ["whistle-intro", "whistle-regression", "whistle-take2"]) {
    const take = loadFixture(name);
    await measure(name, createPortableTune(take.record, take.frames));
  }
  for (const count of [16, 1000]) {
    const record = noteRecording();
    record.durationSec = count / 2;
    record.noteSource.segments = Array.from({ length: count }, (_, i) => ({
      start: i / 2,
      duration: 0.4,
      source: { start: i / 2, end: i / 2 + 0.4 },
      pitch: 72 + (i % 12),
    }));
    await measure(`generated-${count}`, createPortableTune(record, []));
  }
  console.table(rows);
} finally {
  await server.close();
}
