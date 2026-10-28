// @vitest-environment node
import { expect, it } from "vitest";
import { tuneFromFragment, tuneUrl } from "./tune-url";
import { createPortableTune } from "./portable-tune";
import { noteRecording } from "./test-support/note-recording";
it("uses a root Library fragment and restores playback choices", async () => {
  const link = new URL(
    await tuneUrl(createPortableTune(noteRecording(), []), "https://example.com"),
  );
  expect(link.pathname).toBe("/diapason/");
  expect(link.search).toBe("");
  expect(link.hash).toMatch(/^#tune=/);
  expect((await tuneFromFragment(link.hash))?.play).toEqual({ instrument: "flute", octave: -2 });
  expect(await tuneFromFragment("#other")).toBeNull();
  await expect(tuneFromFragment("#tune=%%%")).rejects.toThrow();
});
