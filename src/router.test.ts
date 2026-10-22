import { beforeEach, describe, expect, it } from "vitest";
import { go, takePath } from "./router";

describe("path navigation", () => {
  beforeEach(() => history.replaceState(null, "", "/diapason/"));

  it("uses a URL path for a take and encodes its id", () => {
    go(takePath("take/one"));
    expect(location.pathname).toBe("/diapason/take/take%2Fone");
    expect(location.hash).toBe("");
  });

  it("navigates to the capture path", () => {
    go("/new");
    expect(location.pathname).toBe("/diapason/new");
    expect(location.hash).toBe("");
  });
});
