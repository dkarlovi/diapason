// @vitest-environment node
import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import { noNarrativeComments } from "./no-narrative-comments.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const code = (comment: string) => `${comment}\nx;`;
const invalid = (comment: string, messageId: string) => ({
  code: code(comment),
  errors: [{ messageId }],
});

new RuleTester().run("no-narrative-comments", noNarrativeComments, {
  valid: [
    "// A 401 here is terminal: the fetch layer already retried.",
    "// Safari fires 'ended' before the final result; buffer it.",
    "// See https://bugs.webkit.org/show_bug.cgi?id=12345 for issue 3 upstream.",
    '// Covered by "rewind suppresses flubs until talent passes it".',
    "// The index used to look up positions by word offset.",
    "// Compare against the previously matched word.",
    "/**\n * 1. exposes one member\n * 2. groups actions\n */",
    "// eslint-disable-next-line no-console",
    "// oxlint-disable-next-line react-hooks/exhaustive-deps -- step 2 of setup",
    "// @ts-expect-error step 2 of the type dance",
    "// No retries are attempted for idempotent writes.",
    "// Wait for the session to settle before the first fetch.",
    "// Skip the head instantly so we don't sit through silence.",
    "// 1. The browser supports the SpeechRecognitionPhrase API",
  ].map(code),
  invalid: [
    invalid("// Step 1: validate input", "narration"),
    invalid("// Phase 2: build the index", "narration"),
    invalid("// --- Persistence ---", "narration"),
    invalid("// ── Rendering ──", "narration"),
    invalid("// The panel no longer subscribes, so the chrome stays put.", "invisibleBefore"),
    invalid("// No hand-rolled refresh retry here: the fetch layer does it.", "invisibleBefore"),
    invalid("// We no longer reset the buffer on an external pause.", "invisibleBefore"),
    invalid("// Uses a shared worker instead of the old per-tab socket.", "invisibleBefore"),
    invalid("// Previously, this walked the whole score on every note.", "invisibleBefore"),
    invalid("/* Formerly a class; the hook form avoids the extra tree. */", "invisibleBefore"),
    invalid("// the dominant cost after Attempt #5", "ephemeralRef"),
    invalid("// fixes issue 02", "ephemeralRef"),
    invalid("// Gate added per the roadmap.", "ephemeralRef"),
    invalid("// Shape agreed in this conversation.", "ephemeralRef"),
  ],
});
