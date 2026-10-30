import { expect, it } from "vitest";
import { recordingPath } from "./Routes";

it("encodes recording identifiers in path URLs", () => {
  expect(recordingPath("recording/one")).toBe("/recording/recording%2Fone");
});
