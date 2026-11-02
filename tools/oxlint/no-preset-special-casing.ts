// Enforces the Presets and Controls Invariant in AGENTS.md: a preset only supplies control
// values, so code reads effective controls and never asks which preset supplied them.
// Without type information the rule recognises a preset id by its name (`preset`, `presetId`,
// `preset.id`) and by the literal ids listed in its options.
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<Extract<Rule, { create: unknown }>["create"]>;
type VisitedNode<K extends keyof Visitor> = Parameters<NonNullable<Visitor[K]>>[0];
type Operand = VisitedNode<"BinaryExpression">["left"];
interface Options {
  presetIds?: string[];
  registries?: string[];
  tables?: string[];
}

const EQUALITY = new Set(["===", "!==", "==", "!="]);
const MEMBERSHIP = new Set(["includes", "has"]);
const PRESET_NAME = /^preset(?:Id)?$/i;
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

function nameOf(node: Operand): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) return node.property.name;
  return undefined;
}

function isPresetId(node: Operand): boolean {
  if (node.type === "Identifier")
    return PRESET_NAME.test(node.name) || node.name === "DEFAULT_PRESET";
  if (node.type !== "MemberExpression" || node.computed) return false;
  if (PRESET_NAME.test(node.property.name)) return true;
  return node.property.name === "id" && /preset/i.test(nameOf(node.object) ?? "");
}

const isFixedPreset = (node: Operand) => CONSTANT_NAME.test(nameOf(node) ?? "");
const isRuntimePreset = (node: Operand) => isPresetId(node) && !isFixedPreset(node);

const normalise = (path: string) => path.replaceAll("\\", "/");

export const noPresetSpecialCasing = {
  meta: {
    type: "problem",
    docs: {
      description: "Presets supply control values; behaviour never depends on which preset it is.",
    },
    schema: [
      {
        type: "object",
        properties: {
          presetIds: { type: "array", items: { type: "string" } },
          registries: { type: "array", items: { type: "string" } },
          tables: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      presetLiteral:
        "Preset id '{{id}}' outside the preset registry. Behaviour must follow the effective control values; if a preset needs new behaviour, add a control and give the preset its value.",
      presetComparison:
        "Comparing a preset id against a fixed preset branches on preset identity. Read the effective control that carries the behaviour instead.",
      presetSwitch:
        "Switching on a preset id branches on preset identity. Read the effective control that carries the behaviour instead.",
      presetMembership:
        "Testing whether a preset belongs to a set branches on preset identity. Read the effective control that carries the behaviour instead.",
      presetLookup:
        "A side table keyed by preset id adds hidden per-preset behaviour. Move the value into a control on the preset itself.",
    },
  },
  create(context) {
    const options = (context.options[0] ?? {}) as Options;
    const ids = new Set(options.presetIds ?? []);
    const tables = new Set(options.tables ?? []);
    const filename = normalise(context.filename);
    const inRegistry = (options.registries ?? []).some((registry) =>
      filename.endsWith(normalise(registry)),
    );
    const reportLiteral = (node: VisitedNode<"Literal" | "TemplateLiteral">, value: unknown) => {
      if (!inRegistry && typeof value === "string" && ids.has(value))
        context.report({ node, messageId: "presetLiteral", data: { id: value } });
    };
    return {
      Literal(node) {
        reportLiteral(node, node.value);
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0) reportLiteral(node, node.quasis[0]?.value.cooked);
      },
      BinaryExpression(node) {
        if (!EQUALITY.has(node.operator)) return;
        if (!isPresetId(node.left) && !isPresetId(node.right)) return;
        if (isRuntimePreset(node.left) && isRuntimePreset(node.right)) return;
        context.report({ node, messageId: "presetComparison" });
      },
      SwitchStatement(node) {
        if (isPresetId(node.discriminant)) context.report({ node, messageId: "presetSwitch" });
      },
      CallExpression(node) {
        const [argument] = node.arguments;
        if (
          node.callee.type === "MemberExpression" &&
          MEMBERSHIP.has(nameOf(node.callee) ?? "") &&
          argument &&
          argument.type !== "SpreadElement" &&
          isPresetId(argument)
        )
          context.report({ node, messageId: "presetMembership" });
      },
      MemberExpression(node) {
        if (node.computed && isPresetId(node.property) && !tables.has(nameOf(node.object) ?? ""))
          context.report({ node, messageId: "presetLookup" });
      },
    };
  },
} satisfies Rule;
