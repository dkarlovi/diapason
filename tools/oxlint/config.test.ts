// @vitest-environment node
import { readFileSync } from "node:fs";
import { parseTree, visit } from "jsonc-parser";
import type { Node, ParseError } from "jsonc-parser";
import { expect, it } from "vitest";

function commentBefore(source: string, offset: number): string {
  let comment = "";
  visit(source, {
    onComment(start, length) {
      const end = start + length;
      if (end <= offset && !source.slice(end, offset).trim()) comment = source.slice(start, end);
    },
  });
  return comment;
}

const property = (node: Node | undefined, name: string) =>
  node?.children?.find((entry) => entry.children?.[0]?.value === name)?.children?.[1];

function explanationProblems(source: string, node: Node, label: string): string[] {
  const problems: string[] = [];
  const comment = commentBefore(source, node.offset);
  if (!/Reason:[ \t]*[^\s*/]/.test(comment)) problems.push(`${label}: missing adjacent Reason`);
  const quote = /Quote:[ \t]*"([^"\n]*)"/.exec(comment)?.[1];
  if (/Source:\s*https?:\/\//.test(comment) && !quote?.trim())
    problems.push(`${label}: upstream Source needs a Quote`);
  return problems;
}

const disabledSeverities = new Set(["off", "allow", 0]);
function isDisabled(entry: Node): boolean {
  const value = entry.children?.[1];
  const severity = value?.type === "array" ? value.children?.[0]?.value : value?.value;
  return disabledSeverities.has(severity);
}

const disabledOption = (entry: Node) => entry.children?.[1]?.value === false;

function unexplainedExceptions(source: string): string[] {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, { allowTrailingComma: true });
  if (!root || errors.length) return ["Invalid Oxlint configuration"];
  const settings = ["rules", "categories", "options"].flatMap((group) =>
    (property(root, group)?.children ?? [])
      .filter(group === "options" ? disabledOption : isDisabled)
      .map((node) => ({ node, label: `${group}.${node.children?.[0]?.value}` })),
  );
  const overrides = (property(root, "overrides")?.children ?? []).map((node, index) => ({
    node,
    label: `overrides[${index}]`,
  }));
  return [...settings, ...overrides].flatMap(({ node, label }) =>
    explanationProblems(source, node, label),
  );
}

it.each([
  ['{"rules":{"example/rule":"off"}}', "rules.example/rule: missing adjacent Reason"],
  ['{"rules":{"example/rule":[0]}}', "rules.example/rule: missing adjacent Reason"],
  ['{"rules":{/* Reason: */"example/rule":"off"}}', "rules.example/rule: missing adjacent Reason"],
  [
    '{"rules":{/* Reason: active rule */"example/active":"error","example/rule":"off"}}',
    "rules.example/rule: missing adjacent Reason",
  ],
  ['{"categories":{"style":"allow"}}', "categories.style: missing adjacent Reason"],
  ['{"options":{"typeCheck":false}}', "options.typeCheck: missing adjacent Reason"],
  ['{"overrides":[{"files":["tests/**"],"rules":{}}]}', "overrides[0]: missing adjacent Reason"],
])("rejects undocumented exceptions in %s", (source, problem) => {
  expect(unexplainedExceptions(source)).toEqual([problem]);
});

it.each(["", 'Quote: "   "'])("requires a nonempty excerpt for upstream sources (%s)", (quote) => {
  expect(
    unexplainedExceptions(`{"rules":{
      /* Reason: the project uses a different API.
       * Source: https://example.com/rule
       * ${quote}
       */
      "example/rule":"off"
    }}`),
  ).toEqual(["rules.example/rule: upstream Source needs a Quote"]);
});

it("accepts adjacent rationale with quoted upstream evidence", () => {
  expect(
    unexplainedExceptions(`{"rules":{
      /* Reason: the project uses a different API.
       * Source: https://example.com/rule
       * Quote: "This API is excluded."
       */
      "example/rule":"off"
    }}`),
  ).toEqual([]);
});

it("accepts a zero warning limit without treating it as a disabled check", () => {
  expect(unexplainedExceptions('{"options":{"maxWarnings":0}}')).toEqual([]);
});

it("documents every disabled setting and override in the project configuration", () => {
  const source = readFileSync(new URL("../../.oxlintrc.json", import.meta.url), "utf8");
  expect(unexplainedExceptions(source)).toEqual([]);
});
