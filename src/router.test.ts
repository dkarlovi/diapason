import { expect, it } from "vitest";
import { takePath } from "./router";

it("encodes take identifiers in path URLs", () => {
  expect(takePath("take/one")).toBe("/take/take%2Fone");
});
