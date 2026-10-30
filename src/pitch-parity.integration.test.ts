// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { loadFixture } from "../tests/support/fixtures";

// Captured from the original detector before prefix-sum normalization. These
// protect exact pitch, clarity, voicing, RMS and timing, beyond the MIDI fixtures.
it.each([
  ["whistle-regression", 1899, "ec4332939227cc582f04b438f006435f40d91c0c4dff630dd86486e15870e767"],
  ["whistle-intro", 978, "e53982a661f3ab2b2b28f14f0167cbc333f541b45a58fd9a85310521d7caf3f4"],
  ["whistle-take2", 1858, "bc75528a1f3cd058137c34fd7960cf03e15ed01591d82040ae82ea3db4531440"],
] as const)(
  "preserves every original analysis frame for %s",
  (name, count, hash) => {
    const { frames } = loadFixture(name);
    expect(frames).toHaveLength(count);
    expect(createHash("sha256").update(JSON.stringify(frames)).digest("hex")).toBe(hash);
    // Full-recording pitch analysis is slower under V8 coverage on shared runners.
  },
  60_000,
);
