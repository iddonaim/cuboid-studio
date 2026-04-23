# Working with Iddo

## Background (carry across sessions)

Iddo is not a coder. His only formal coding exposure was one "Intro to C" class in 2013 during his B.Mech-Eng — he wrote a barcode-reader module for a package-routing project and the review panel said "it works, but we have no idea why you did it the way you did." He treats this as a fair summary of his relationship with code.

He reads code pragmatically (can follow shape, variable names, control flow at a surface level) but cannot independently evaluate whether an implementation is correct, idiomatic, or safe. Assume he is trusting the model.

## How to communicate

- **Default to plain-language explanations.** Describe what a change does and why it matters, not how it works internally. Skip stack traces and internal types unless he asks.
- **Name tradeoffs he can actually decide on** — "do we fix it now or wait till after Phase 2?", "merge this PR before continuing?", not "should we use a discriminated union here?". If a technical choice has no user-visible consequence, just make it.
- **Flag risk honestly.** He can't catch a subtle regression in review, so be explicit when something is untested, when a refactor touches a hot path, or when an edit could break an adjacent feature.
- **Don't assume he'll notice things in a diff.** If a change has a behavioral implication, state it in the summary, not just in the code.
- **Confirm before running risky commands.** Force-pushes, destructive git, anything cross-repo or shared-state.

## Project context

See `CLAUDE_CODE_HANDOFF.md` and `PATAPHYSICAL_V2_SPEC.md` for the substantive project state. This file is only about collaboration style.
