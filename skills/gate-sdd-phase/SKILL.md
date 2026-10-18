---
name: gate-sdd-phase
description: Turn one ROADMAP phase into a spec + atomic tasks ready to execute.
triggers: [sdd phase, spec this phase, break the phase into tasks, plan phase]
skill-kind: sdd
metadata.source: gatewright
---
# SDD · phase
**When:** a roadmap phase is next and you need an executable plan.
**Do:**
1. Read the phase's deliverables from ROADMAP; report any drift vs the code first.
2. Group the phase into coherent features; per feature write `spec.md` (summary, why, FN/NF requirements, out-of-scope, deps).
3. Decompose into `tasks.md` — one task = one logical change = one commit, each with done-when criteria traceable to a requirement id.
4. Order tasks so dependencies are explicit; backend before the UI that needs it.
**Output:** `.specs/features/<slug>/spec.md` + `tasks.md` per feature.
**Guardrails:** no task should touch more than ~5 related files; if it's big, split it.
