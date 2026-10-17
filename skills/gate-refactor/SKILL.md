---
name: gate-refactor
description: Improve structure without changing behavior, in safe reversible steps.
triggers: [refactor, clean up, simplify, extract, rename]
skill-kind: development
metadata.source: gatewright
---
# Refactor
**When:** the code works but is hard to change, and tests exist (or you add them first).
**Do:**
1. Pin behavior with a test that passes now.
2. Make one named move at a time (extract, rename, inline, invert) — keep each step green.
3. Commit per safe step with a message that names the move.
4. Stop when the next change becomes obvious; don't gold-plate.
**Output:** same behavior, smaller surface, commits that read as a sequence of safe moves.
**Guardrails:** never mix a refactor with a behavior change in the same commit.
