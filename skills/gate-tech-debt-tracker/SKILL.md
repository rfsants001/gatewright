---
name: gate-tech-debt-tracker
description: Log, triage and pay down tech debt deliberately instead of letting it rot.
triggers: [tech debt, todo, fixme, cleanup later, debt]
skill-kind: development
metadata.source: claude-skills-mit
---
# Tech debt tracker
**When:** you take a shortcut, or you spot one worth recording.
**Do:**
1. Record each debt with: where, why it exists, the cost of leaving it, and the fix.
2. Triage by interest rate — how much it slows everything else — not by age.
3. Pay down the highest-interest items as part of nearby work, not a separate heroic sprint.
4. Close items explicitly; delete the ones that stopped mattering.
**Output:** a living, ranked debt list tied to code locations.
**Guardrails:** a TODO with no owner, cost, or fix is noise — capture the context or don't log it.
