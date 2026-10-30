# Auto tune

Ship the context-only model preferred in the listening experiment through an explicit **Context correction** slider (0–100%) available on every preset. **Auto tune** supplies 100%; existing presets supply 0%, and Clean remains the default. No dependency is added; glide handling is deferred to #50. Existing presets and previously shared tunes retain their interpretation at their original control values.

At 100% Context correction, the selected model adds a natural-scale preference of 4 at full key pull, permits the raised minor seventh over the inferred major dominant, and adds a quadratic cost of 0.3 for jumps beyond two semitones at the default Smooth leaps value of 0.1. Context correction scales both additions continuously; Pull into key and Smooth leaps scale their respective contributions. At 0% the additions are disabled. Segmentation, representative pitches and default eighth-grid timing use existing Clean settings, matching the reviewed fixture auditions. The existing grid control can preserve performed timing.

Invariant: presets are value recipes only. The engine and portable interpretation-version selection use effective controls, never preset identity. Tests apply the same full controls through every preset and require identical results, including preview/apply and export round trips. Fractional and explicit-zero overrides survive sharing; missing historical controls default to zero without rewriting saved observations.

Approaches considered: existing knob adjustments could not recover corrections without collateral changes; the context-only model recovered six with none and improved listened-to fixtures; glide anchoring recovered seven but is separately scoped. Use the context-only model, not an expanded tuning algorithm.

The app's existing preset picker provides preview/apply/reset; all processing flows through the shared recording model. Append a portable preset code, preserve old codes, and distinguish the new interpretation in portable data while still decoding v1. Preserve manual edits/mutes and sound settings on export/import. No permanent CLI expansion is part of this work.

Regression expectations: freeze measured source segments from the Moon investigation with six corrections and #11 unresolved; preserve the approved 14-note intro; pin the listened-to regression/take2 candidate sequences as behavior of this experimental preset without claiming take2 is correct. Strong musical correction may change deliberate chromatic notes: explain this limitation and keep As played/Keep my odd notes available.
