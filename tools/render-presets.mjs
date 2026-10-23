import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({ options: { out: { type: "string" }, presets: { type: "string" } } });
if (!values.out) {
  console.error(
    "Usage: npm run render:presets -- --out directory [--presets as-played,gentle,clean,keep-odd]",
  );
  process.exitCode = 2;
} else {
  await withRenderer(values).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
async function withRenderer(options) {
  const server = await createServer({
    mode: "replay",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  try {
    await render(server, options);
  } finally {
    await server.close();
  }
}

function synthesize(notes, sampleRate, sampleCount) {
  const pcm = new Float32Array(sampleCount);
  for (const note of notes) {
    const frequency = 440 * 2 ** ((note.midi - 24 - 69) / 12);
    const first = Math.max(0, Math.round(note.start * sampleRate));
    const last = Math.min(sampleCount, Math.round((note.start + note.duration) * sampleRate));
    for (let i = first; i < last; i++) {
      const t = (i - first) / sampleRate;
      const envelope = Math.min(1, t / 0.01, (last - i) / sampleRate / 0.05);
      const phase = 2 * Math.PI * frequency * t;
      pcm[i] +=
        0.32 *
        envelope *
        (Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase));
    }
  }
  return pcm;
}
function sungCents(note, frames, freqToMidi) {
  const pitches = frames
    .filter(
      (frame) =>
        frame.t >= note.start &&
        frame.t < note.start + note.duration &&
        frame.freq !== null &&
        frame.clarity >= 0.9,
    )
    .map((frame) => freqToMidi(frame.freq))
    .sort((a, b) => a - b);
  return pitches.length
    ? ((pitches[Math.floor(pitches.length / 2)] - note.midi) * 100).toFixed(0)
    : "n/a";
}
async function render(server, options) {
  const { PRESETS } = await server.ssrLoadModule("/src/melody/knobs.ts");
  const { interpretMelody, agreement } = await server.ssrLoadModule("/src/melody/interpret.ts");
  const { loadFixture } = await server.ssrLoadModule("/src/test-support/fixtures.ts");
  const { freqToMidi } = await server.ssrLoadModule("/src/notes.ts");
  const { keyName } = await server.ssrLoadModule("/src/melody/key.ts");
  const { wavBytes } = await server.ssrLoadModule("/src/wav.ts");
  const { notesToMidi } = await server.ssrLoadModule("/src/midi.ts");
  const presets = selectPresets(options.presets, PRESETS);
  const takes = ["whistle-regression", "whistle-take2"].map((name) => ({
    name,
    ...loadFixture(name),
  }));
  const reference = JSON.parse(
    await readFile(
      new URL("../src/fixtures/whistle-regression/reference.json", import.meta.url),
      "utf8",
    ),
  );
  const results = new Map();
  const report = [
    "# Melody preset listening renders",
    "",
    "Synth WAV previews play two octaves below the detected whistle. MIDI files retain the detected pitch. Originals are unchanged.",
    "",
    "Intent presets are candidates for listening approval. Mood weights remain placeholders until the second phase.",
    "",
    "The old take-1 reference is retained for comparison; faithful output is judged by ear rather than required to match the old tracker.",
    "",
    "## Summary",
    "",
    "| Preset | Take 1 notes / key | Take 2 notes / key | Between-take edits | Take 1 edits vs old reference |",
    "| --- | --- | --- | --- | --- |",
  ];
  const modules = { PRESETS, interpretMelody, freqToMidi, wavBytes, notesToMidi };
  for (const id of presets) {
    const pair = [];
    for (const take of takes) pair.push(await renderTake(take, id, options.out, modules));
    results.set(id, pair);
    const describe = (result) =>
      `${result.notes.length} / ${result.key.chosen ? keyName(result.key.chosen) : "none"}`;
    report.push(
      `| ${PRESETS[id].label} | ${describe(pair[0])} | ${describe(pair[1])} | ${agreement(pair[0].notes, pair[1].notes)} | ${agreement(pair[0].notes, reference)} |`,
    );
  }
  report.push(
    "",
    "Edit counts are Levenshtein distance over complete pitch sequences, without alignment or trimming. They are comparisons, not a quality score.",
  );
  appendTakes(report, takes, presets, results, { PRESETS, keyName, freqToMidi });
  await writeFile(resolve(options.out, "README.md"), report.join("\n") + "\n");
  console.log(report.slice(0, report.indexOf("## whistle-regression")).join("\n"));
  console.log(`\nRenders: ${resolve(options.out)}`);
}

function selectPresets(selection, PRESETS) {
  const presets = selection ? selection.split(",").map((id) => id.trim()) : Object.keys(PRESETS);
  if (!presets.length || presets.some((id) => !Object.hasOwn(PRESETS, id)))
    throw new Error(`Unknown preset. Choose from: ${Object.keys(PRESETS).join(", ")}`);
  return presets;
}
async function renderTake(
  take,
  id,
  out,
  { PRESETS, interpretMelody, freqToMidi, wavBytes, notesToMidi },
) {
  const result = interpretMelody(take.frames, {
    knobs: PRESETS[id].knobs,
    key: "auto",
    timing: { bpm: take.record.bpm, beatsPerBar: take.record.beatsPerBar },
    range: { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) },
  });
  const folder = resolve(out, take.name);
  await mkdir(folder, { recursive: true });
  await writeFile(
    resolve(folder, `${id}.wav`),
    new Uint8Array(
      wavBytes(synthesize(result.notes, take.sampleRate, take.pcm.length), take.sampleRate),
    ),
  );
  await writeFile(
    resolve(folder, `${id}.mid`),
    new Uint8Array(await notesToMidi(result.notes, { bpm: take.record.bpm }).arrayBuffer()),
  );
  return result;
}
function appendPreset(report, id, result, take, { PRESETS, keyName, freqToMidi }) {
  report.push(
    "",
    `### ${PRESETS[id].label}`,
    "",
    `[Listen WAV](${take.name}/${id}.wav) · [MIDI](${take.name}/${id}.mid)`,
    "",
    `Key: ${result.key.chosen ? keyName(result.key.chosen) : "none"} (auto). Candidates: ${result.key.ranked
      .slice(0, 3)
      .map((r) => `${keyName(r.key)} (${r.score.toFixed(3)})`)
      .join(", ")}.`,
    "",
    "| Note | MIDI | Start (s) | Length (s) | Sung cents from output note |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const note of result.notes)
    report.push(
      `| ${note.name} | ${note.midi} | ${note.start.toFixed(3)} | ${note.duration.toFixed(3)} | ${sungCents(note, take.frames, freqToMidi)} |`,
    );
}

function appendTakes(report, takes, presets, results, { PRESETS, keyName, freqToMidi }) {
  for (const [takeIndex, take] of takes.entries()) {
    report.push(
      "",
      `## ${take.name}`,
      "",
      `Length: ${(take.pcm.length / take.sampleRate).toFixed(3)} s; ${take.sampleRate} Hz; ${take.record.bpm} BPM.`,
    );
    for (const id of presets)
      appendPreset(report, id, results.get(id)[takeIndex], take, { PRESETS, keyName, freqToMidi });
  }
}
