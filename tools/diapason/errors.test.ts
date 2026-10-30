// @vitest-environment node
import { expect, it } from "vitest";
import { PackageError } from "../../src/Inspection/Api.ts";
import { errorReport } from "./errors.ts";
it("preserves the reader's explicitly untrusted validation context", () => {
  const error = new PackageError("malformed", "audio.sha256", "pcm.identity", "PCM hash differs.", {
    schemaVersion: 2,
  });
  expect(errorReport(error).data.error).toEqual({
    code: "malformed",
    message: "PCM hash differs.",
    path: "audio.sha256",
    check: "pcm.identity",
    context: { schemaVersion: 2 },
    trusted: false,
  });
});
it("does not treat filesystem paths or unmarked context as package validation evidence", () => {
  const error = Object.assign(new Error("Input file is missing."), {
    code: "ENOENT",
    path: "/tmp/missing.wav",
    context: { schemaVersion: 999 },
  });
  expect(errorReport(error).data.error).toEqual({
    code: "ENOENT",
    message: "Input file is missing.",
  });
});
