---
name: gate-spec-driven
description: Turn a fuzzy task into a spec + atomic tasks before writing code.
triggers: [spec, plan this, break down, before coding, sdd]
skill-kind: architecture
metadata.source: gatewright
---
# Spec-driven
**When:** the task is more than a one-liner or touches more than one file.
**Do:**
1. Write a 2-sentence summary and the "why" (what it enables).
2. List functional requirements as testable IDs (FN-001 …) and non-functional ones.
3. State what is explicitly out of scope.
4. Decompose into atomic tasks — one task = one logical change = one commit — with done-when criteria.
**Output:** `spec.md` + `tasks.md`; each task traceable to a requirement id.
**Guardrails:** no task should need more than ~5 related files; if it's big, split it.
