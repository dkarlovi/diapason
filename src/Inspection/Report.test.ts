// @vitest-environment node
import { expect, it } from "vitest";
import { investigationInput } from "../../tests/support/investigation";
import { summarizePackage } from "./Report";
it("summarizes saved evidence without returning bulk package data", async () => {
  const { input } = await investigationInput();
  const report = summarizePackage(input, {
    path: "/tmp/my recording.wav",
    wavSha256: "a".repeat(64),
    pcmSha256: null,
    sampleRate: 48000,
    sampleCount: 24000,
  });
  expect(report).toMatchObject({ schemaVersion: 1, kind: "inspect", overall: "incomplete" });
  expect(report.data).toMatchObject({
    name: "Whistle | Δ",
    durationSeconds: 0.5,
    sampleRate: 48000,
    pitchCorrections: 0,
  });
  expect(report.data).not.toHaveProperty("midiBytes");
  expect(report.data).not.toHaveProperty("frames");
  expect(report.nextSteps[0]?.argv).toContain("/tmp/my recording.wav");
});
