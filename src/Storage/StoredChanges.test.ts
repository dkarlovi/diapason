import { expect, it, vi } from "vitest";
import { publishStoredChange, subscribeStoredChanges } from "./StoredChanges";

const delivered = () => new Promise((resolve) => setTimeout(resolve, 0));

it("delivers published changes to every subscriber until it unsubscribes", async () => {
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = subscribeStoredChanges(first);
  const stopSecond = subscribeStoredChanges(second);
  publishStoredChange({ kind: "recording", id: "a" });
  await delivered();
  expect(first).toHaveBeenCalledWith({ kind: "recording", id: "a" });
  expect(second).toHaveBeenCalledWith({ kind: "recording", id: "a" });
  stopFirst();
  publishStoredChange({ kind: "recording", id: "b" });
  await delivered();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
  stopSecond();
});
it("ignores messages that are not stored changes", async () => {
  const listener = vi.fn();
  const stop = subscribeStoredChanges(listener);
  const foreign = new BroadcastChannel("diapason:stored-changes");
  foreign.postMessage({ kind: "recording", id: 7 });
  foreign.postMessage({ kind: "tune-draft", fragment: "#tune=a", source: "x", savedAt: NaN });
  foreign.postMessage(null);
  await delivered();
  expect(listener).not.toHaveBeenCalled();
  foreign.close();
  stop();
});
