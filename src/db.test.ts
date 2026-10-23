import { afterEach, expect, it, vi } from "vitest";
import { storageEstimate } from "./db";
afterEach(() => vi.unstubAllGlobals());
it("reports browser storage usage and tolerates unavailable estimates", async () => {
  vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 100, quota: 1000 }) } });
  expect(await storageEstimate()).toEqual({ usage: 100, quota: 1000 });
  vi.stubGlobal("navigator", {});
  expect(await storageEstimate()).toBeNull();
});
