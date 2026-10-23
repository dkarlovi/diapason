import { expect, it } from "vitest";
import { recordingPath } from "./router";

it("encodes recording identifiers in path URLs", () => {
  expect(recordingPath("recording/one")).toBe("/recording/recording%2Fone");
});
