---
name: gate-feature-factory
description: Drive a feature end-to-end — spec, slices, implement, verify, PR.
triggers: [build this feature, end to end, ship the feature, from scratch]
skill-kind: workflows
metadata.source: gatewright
---
# Feature factory
**When:** a whole feature needs to go from idea to merged, not just one edit.
**Do:**
1. Spec it (see gate-spec-driven) and slice into atomic, shippable tasks.
2. Implement one slice at a time; keep the build + tests green after each.
3. Verify against the done-when criteria, not vibes.
4. Author the PR (see gate-pr-author); stop at the human merge gate.
**Output:** a sequence of green commits that together satisfy the spec.
**Guardrails:** no slice larger than a reviewable commit; never skip the verify step.
