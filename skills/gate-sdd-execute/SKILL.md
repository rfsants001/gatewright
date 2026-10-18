---
name: gate-sdd-execute
description: Execute exactly one atomic task, verify its done-when, and make one commit.
triggers: [sdd execute, do the next task, run one task, implement task]
skill-kind: sdd
metadata.source: gatewright
---
# SDD · execute
**When:** a task from `tasks.md` is ready and its dependencies are met.
**Do:**
1. Read the one task and its done-when criteria; touch only what it needs.
2. Implement it; keep the build + tests green.
3. Verify each done-when criterion explicitly — not vibes.
4. Make one atomic commit with the task's commit message; mark the task done.
**Output:** one green commit that satisfies exactly one task.
**Guardrails:** one invocation = one task = one commit; never bundle tasks or sneak in unrelated changes.
