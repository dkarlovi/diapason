// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../test-support/investigation";
import { getView } from "./views";
it("keeps saved observations separate from current replay and automatic inference", async () => {
  const { context } = await investigationContext();
  const saved = await getView(context, "saved");
  expect(saved.frames).toEqual(
    context.input.metadata.schemaVersion === 2 ? context.input.metadata.frames : [],
  );
  expect(saved.provenance.every((p) => p.disposition === "saved")).toBe(true);
  const replay = await getView(context, "replay");
  const automatic = await getView(context, "automatic");
  expect(replay.evidence.notes).toEqual(saved.evidence.notes);
  expect(automatic.name).toBe("automatic");
  expect(automatic.runKey).not.toBe(saved.runKey);
});
it("rejects unsupported recipes and reports missing historical melody", async () => {
  const { context } = await investigationContext();
  await expect(getView(context, "saved", {} as never)).rejects.toThrow(/recipe/i);
  const p = context.input.metadata;
  context.input.metadata = {
    app: "diapason",
    kind: "recording",
    schemaVersion: 1,
    recording: p.recording,
    provenance: p.provenance,
  };
  await expect(getView(context, "saved")).rejects.toThrow(/unavailable/i);
});
