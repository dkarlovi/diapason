// @vitest-environment node
import { expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeTune, fromBase64Url } from "./Tune.codec";
import { TUNE_LIMITS } from "./PortableTune";
it("rejects decompression bombs before parsing them", async () => {
  const compressed = gzipSync(new Uint8Array(TUNE_LIMITS.decoded + 1));
  await expect(
    decodeTune(Uint8Array.from([68, 80, 83, 78, 1, 1, 1, ...compressed])),
  ).rejects.toThrow(/large/);
});
it("rejects oversized and noncanonical base64url without allocating a tune", () => {
  expect(() => fromBase64Url("ab")).toThrow();
  expect(() => fromBase64Url("a".repeat(TUNE_LIMITS.encoded * 2))).toThrow();
});
