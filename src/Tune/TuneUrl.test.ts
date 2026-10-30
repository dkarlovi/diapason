// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { tuneFromFragment, tuneUrl } from "./TuneUrl";
import { createPortableTune } from "./PortableTune";
import { noteRecording } from "../../tests/support/note-recording";
it("uses an editor fragment and restores playback choices", async () => {
  const link = new URL(
    await tuneUrl(createPortableTune(noteRecording(), []), "https://example.com"),
  );
  expect(link.pathname).toBe("/diapason/tune");
  expect(link.search).toBe("");
  expect(link.hash).toMatch(/^#tune=/);
  expect((await tuneFromFragment(link.hash))?.play).toEqual({ instrument: "flute", octave: -2 });
  expect(await tuneFromFragment("#other")).toBeNull();
  await expect(tuneFromFragment("#tune=%%%")).rejects.toThrow();
});

it("opens the supplied showcase example as a valid playable tune", async () => {
  const html = readFileSync("dev/embed.html", "utf8");
  const payload = /const exampleTune\s*=\s*"([^"]+)"/.exec(html)![1]!;
  const tune = await tuneFromFragment(`#tune=${payload}`);
  expect(tune?.name).toBe("Fly me to the moon");
  expect(tune!.noteSource.segments.length).toBeGreaterThan(0);
});
