---
name: gate-sdd-init
description: Stand up the .specs structure for a project — PROJECT, ROADMAP, STATE — before any feature work.
triggers: [sdd init, set up specs, start the project, scaffold .specs]
skill-kind: sdd
metadata.source: gatewright
---
# SDD · init
**When:** a project has no `.specs/` yet, or you're formalizing how it's planned.
**Do:**
1. Create `.specs/project/PROJECT.md` — vision, problem, goals, non-goals, constraints.
2. Create `ROADMAP.md` — phases ordered by dependency, each with a focus and deliverables.
3. Create `STATE.md` — current phase, decisions, blockers, deferred ideas, preferences.
4. Keep `.specs/` local (git-ignored if planning shouldn't ship); it's the source of truth alongside the code.
**Output:** the three project docs, ready for the first `gate-sdd-phase`.
**Guardrails:** don't spec features here — this is project-level only; one roadmap, dependency-ordered.
