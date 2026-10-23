import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createRef } from "react";
import { LiveMonitor } from "./LiveMonitor";
import { StatusChecklist } from "./StatusChecklist";
afterEach(cleanup);
it("distinguishes sound without pitch and supplies an accessible level meter", () => {
  render(
    <LiveMonitor
      level={{ rms: 0.1, peak: 0.2, freq: null }}
      traceRef={createRef()}
      mode="listen"
      bpm={90}
      beatsPerBar={4}
      confirmed={false}
      connected={true}
      gain={1}
      onGainChange={() => {}}
      locked={false}
    />,
  );
  expect(screen.getAllByText(/Sound detected; no whistle pitch/)[0]).toBeTruthy();
  expect(screen.getByRole("meter", { name: "Input level" }).getAttribute("aria-valuenow")).toBe(
    "40",
  );
  expect(screen.getByText(/Preview grid/)).toBeTruthy();
});
it("renders saved check results with text and does not interpret markup", () => {
  const { container } = render(
    <StatusChecklist
      checks={[
        {
          id: "quiet",
          label: "<b>Low room noise</b>",
          detail: "Quiet enough",
          status: "passed",
          blocking: true,
        },
      ]}
    />,
  );
  expect(screen.getByText(/Passed/)).toBeTruthy();
  expect(container.querySelector("b")).toBeNull();
});
