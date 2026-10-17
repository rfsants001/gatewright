---
name: gate-code-review
description: Review a diff for correctness, then for simplification — findings only.
triggers: [review, code review, look at this diff, feedback on]
skill-kind: quality
metadata.source: gatewright
---
# Code review
**When:** a change is proposed and you want it to be right and small.
**Do:**
1. First pass — correctness: edge cases, error paths, concurrency, resource leaks, security.
2. Second pass — simplification: duplication, dead code, clearer names, smaller surface.
3. Tie each finding to a file:line and say why it matters; propose the fix.
4. Separate must-fix from nice-to-have.
**Output:** a short, prioritized findings list — no praise padding, no restating the diff.
**Guardrails:** flag only what you can justify; uncertainty is a question, not a verdict.
