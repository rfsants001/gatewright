---
name: gate-sdd-review
description: Audit a feature's tasks for atomicity, dependencies, done-when quality and commit hygiene.
triggers: [sdd review, audit tasks, check the plan, is this plan ready]
skill-kind: sdd
metadata.source: gatewright
---
# SDD · review
**When:** a `tasks.md` is drafted and you want it sound before executing.
**Do:**
1. Atomicity: each task is one logical change, one commit, ≤~5 related files — flag the fat ones.
2. Traceability: every task maps to a requirement id in the spec; flag orphans and gaps.
3. Done-when: criteria are verifiable (a check can pass/fail), not aspirational.
4. Order: dependencies are explicit and acyclic; commit messages are scoped and imperative.
**Output:** a findings list with the fixes; ask for approval before changing the plan.
**Guardrails:** review the plan, don't execute it; a vague done-when is a blocker, not a nit.
