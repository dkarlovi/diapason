// @vitest-environment node
import { expect, it } from "vitest";
import { compareFindings, countFindings, type Diagnostic } from "./baseline.ts";

const finding = (filename: string, code: string, line = 1): Diagnostic => ({
  filename,
  code,
  message: `${code} message`,
  labels: [{ span: { line, column: 3 } }],
});

it("counts findings per file and rule in a stable order", () => {
  const counts = countFindings([
    finding("src/B.ts", "react(refs)"),
    finding("src/A.ts", "react(refs)"),
    finding("src/A.ts", "react(refs)"),
    finding("src/A.ts", "react-hooks(exhaustive-deps)"),
  ]);
  expect(JSON.stringify(counts)).toBe(
    JSON.stringify({
      "src/A.ts": { "react(refs)": 2, "react-hooks(exhaustive-deps)": 1 },
      "src/B.ts": { "react(refs)": 1 },
    }),
  );
});

it("passes when the findings match the baseline exactly", () => {
  expect(compareFindings([finding("src/A.ts", "rule")], { "src/A.ts": { rule: 1 } })).toEqual([]);
});

it("fails a count above the baseline and lists the findings with their location", () => {
  const problems = compareFindings(
    [finding("src/A.ts", "rule", 4), finding("src/A.ts", "rule", 9)],
    { "src/A.ts": { rule: 1 } },
  );
  expect(problems).toEqual([
    "src/A.ts: rule has 2 findings, baseline allows 1",
    "  src/A.ts:4:3 rule message",
    "  src/A.ts:9:3 rule message",
  ]);
});

it("fails a finding in a file or rule the baseline does not know", () => {
  expect(compareFindings([finding("src/New.ts", "rule")], {})).toEqual([
    "src/New.ts: rule has 1 findings, baseline allows 0",
    "  src/New.ts:1:3 rule message",
  ]);
});

it("fails until the baseline is lowered once findings are fixed", () => {
  expect(compareFindings([], { "src/A.ts": { rule: 2 } })).toEqual([
    "src/A.ts: rule is down to 0 from 2; lower the baseline with npm run lint:baseline",
  ]);
});
