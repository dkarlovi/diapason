# Oxlint native suppressions and type awareness

**Goal:** Replace custom lint baselining, then evaluate type-aware bug detection while preserving inferred types.

**Approach:** Keep existing category choices and TypeScript checking. Use Oxlint's automatically discovered suppression file and config-level type awareness. Do not enable annotation or stylistic rules.

- [x] Generate native suppressions for existing findings; verify their counts against the custom baseline, then remove the wrapper, helpers, tests, and old baseline.
- [x] Point npm scripts at Oxlint and native suppression pruning; update maintained development and agent instructions.
- [x] Install compatible `oxlint-tsgolint`, enable `options.typeAware`, and inspect additional correctness findings before deciding how to handle them.
- [x] Verify native suppression growth and stale-entry failures in temporary fixtures, run repository checks, and report findings and limitations.

**Validation:** Plain Oxlint and npm lint must agree. Existing suppression counts must survive migration. Inspect type-aware diagnostics by rule and location; keep any newly discovered backlog separate from the migrated baseline during evaluation. Review README for public documentation impact.

**Evaluation:** Type-aware correctness adds 109 findings: 73 unbound methods, 26 floating promises, five object stringifications, two class-instance spreads, two redundant unions, and one redundant optional-parameter union. These remain unsuppressed for review. Many unbound-method findings concern method-shaped callback contracts; 22 floating-promise findings are in tests and four are router navigation calls. No new categories or annotation requirements are enabled. README needs no change because the public overview, quick start, and documentation links are unchanged.

**Results:** Native counts match all 55 original findings. Temporary fixtures verify suppression loading, growth failure, stale failure, pruning, and a clean run. All 903 tests pass with coverage; typecheck, architecture, structure, naming, formatting, duplication, audit, health, and build checks pass separately. The full check stops at lint because the 109 newly discovered findings remain visible. Coverage tests require subprocess access for CLI integration tests.
