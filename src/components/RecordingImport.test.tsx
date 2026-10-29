import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { RecordingImport } from "./RecordingImport";
import { Popover } from "./ui/popover";
import { recording } from "../test-support/recording";
import type { ReadRecordingPackage } from "../recording-package-types";
afterEach(cleanup);
it("offers restoration or fresh audio independently of the collision-copy choice", async () => {
  const record = recording({ id: "incoming" });
  const onOptions = vi.fn();
  // Only the schema discriminant is consumed by these controls. Package integrity
  // is tested through the real parser in recording-package.test.ts.
  const input = { metadata: { schemaVersion: 2 } } as ReadRecordingPackage;
  render(
    <MemoryRouter>
      <Popover open>
        <RecordingImport
          candidates={[
            { file: "take.wav", record, existing: record, package: input, tuneMode: "restore" },
          ]}
          onCandidateOptions={onOptions}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </Popover>
    </MemoryRouter>,
  );
  const select = screen.getByRole("combobox", { name: "Melody for take.wav" });
  expect((select as HTMLSelectElement).value).toBe("restore");
  await userEvent.selectOptions(select, "fresh");
  expect(onOptions).toHaveBeenLastCalledWith(0, { tuneMode: "fresh" });
  await userEvent.click(screen.getByRole("checkbox", { name: "Import as copy" }));
  expect(onOptions).toHaveBeenLastCalledWith(0, { disposition: "copy" });
  expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toContain("incoming");
});
