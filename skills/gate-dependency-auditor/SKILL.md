---
name: gate-dependency-auditor
description: Audit dependencies for risk — stale, unmaintained, vulnerable, or license-incompatible.
triggers: [audit dependencies, outdated packages, vulnerable deps, license check]
skill-kind: quality
metadata.source: claude-skills-mit
---
# Dependency auditor
**When:** before a release, or when the lockfile hasn't been looked at in a while.
**Do:**
1. List direct deps with current vs latest, and flag majors behind.
2. Flag unmaintained (no release in ~2y) and known-vulnerable packages.
3. Check licenses against the project's policy; flag incompatible ones.
4. Separate "update now" (security) from "schedule" (routine) from "pin/replace".
**Output:** a prioritized action list, not a raw dump.
**Guardrails:** don't bulk-bump majors blindly; each major is its own reviewed change.
