// Enforces the comment rules in AGENTS.md: comments explain why, not what happened or what
// comes next. Restating the code has no regex form and stays a review-time judgement call.
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
interface Pattern {
  re: RegExp;
  hint: string;
}

// A bare "1." list usually enumerates conditions, which is prose; only an explicit step label
// is unambiguous enough to flag.
const NARRATION: Pattern[] = [
  { re: /^\s*(?:step|phase|part|stage)\s+\d+\b/i, hint: "Step N:" },
  { re: /^\s*(?:-{3,}|={3,}|#{2,}|[─━═]{2,})\s*\w/, hint: "section divider" },
];

// "used to" means "utilized for" as often as it describes a past state, so it is not a pattern.
const INVISIBLE_BEFORE: Pattern[] = [
  { re: /\bno longer\b/i, hint: "no longer" },
  { re: /\bformerly\b/i, hint: "formerly" },
  {
    re: /\b(?:instead of|rather than)\s+(?:the\s+|a\s+|an\s+)?(?:old|previous|former|original|hand-?\s?roll\w*|manual\w*)\b/i,
    hint: "instead of the old…",
  },
  { re: /\bwe\s+(?:no longer|stopped|used to|removed)\b/i, hint: "we no longer…" },
  {
    re: /\bpreviously[,;]|\bpreviously\s+(?:we|this|it|there|the code|these|those)\b|\bwas previously\b/i,
    hint: "previously",
  },
  // The window keeps "here" inside the same clause as the "no".
  { re: /\bno\s+[\w-]+(?:\s+[\w-]+){0,5}\s+here\b/i, hint: "No … here" },
];

const EPHEMERAL_REF: Pattern[] = [
  { re: /\battempt\s*#?\s*\d+/i, hint: "Attempt #N" },
  {
    re: /\b(?:issue|ticket|task|plan|phase|step|iteration)\s*#?\s*\d+\b/i,
    hint: "issue/plan N",
  },
  { re: /\bper\s+(?:the\s+)?(?:plan|roadmap|spec doc|above discussion)\b/i, hint: "per the plan" },
  { re: /\b(?:this|the above|the previous)\s+(?:conversation|chat)\b/i, hint: "this conversation" },
];

const URL_RE = /https?:\/\//i;
const PRAGMA_RE = /^\s*(?:eslint-|oxlint-|fallow-ignore|@ts-|prettier-|c8 |v8 |istanbul )/;

type MessageId = "narration" | "invisibleBefore" | "ephemeralRef";
const firstMatch = (text: string, patterns: Pattern[]) => patterns.find(({ re }) => re.test(text));

/** Which fault a comment commits, if any. JSDoc may hold numbered invariants, so only line
 *  comments are checked for narration; a link is the durable reference the rule asks for. */
function classifyComment(
  text: string,
  type: "Line" | "Block",
): { messageId: MessageId; hint: string } | null {
  if (PRAGMA_RE.test(text)) return null;
  const narration = type === "Line" ? firstMatch(text, NARRATION) : undefined;
  if (narration) return { messageId: "narration", hint: narration.hint };
  const before = firstMatch(text, INVISIBLE_BEFORE);
  if (before) return { messageId: "invisibleBefore", hint: before.hint };
  const ephemeral = URL_RE.test(text) ? undefined : firstMatch(text, EPHEMERAL_REF);
  return ephemeral ? { messageId: "ephemeralRef", hint: ephemeral.hint } : null;
}

export const noNarrativeComments = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Comments explain why; they do not narrate, compare to history, or cite plans.",
    },
    messages: {
      narration:
        "Narrating comment ({{hint}}): a labelled walkthrough means the body wants splitting. Extract the section into a named function or hook; the name is the comment.",
      invisibleBefore:
        "Comment compares against an invisible 'before' ({{hint}}): the reader cannot see the prior version. State the present-tense fact instead; git records the change.",
      ephemeralRef:
        "Comment references an ephemeral id ({{hint}}): it has no permalink and rots when the plan is archived. Cite a spec, a bug URL, or a test name.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== "Line" && comment.type !== "Block") continue;
          const fault = classifyComment(comment.value, comment.type);
          if (fault)
            context.report({
              node: comment,
              messageId: fault.messageId,
              data: { hint: fault.hint },
            });
        }
      },
    };
  },
} satisfies Rule;
