---
name: gate-council
description: Decide a hard call by generating independent options and judging them.
triggers: [which approach, trade-off, decide between, options]
skill-kind: workflows
metadata.source: gatewright
---
# Council
**When:** the solution space is wide and the first idea shouldn't win by default.
**Do:**
1. Generate 2-3 genuinely different approaches, each with its strongest case.
2. Score each against the real constraints (cost, risk, reversibility, time).
3. Pick one and say why; graft the best ideas from the runners-up.
4. Record the call as an ADR if it's expensive to reverse.
**Output:** a chosen approach with the trade-off made explicit.
**Guardrails:** options must be real alternatives, not one plan and two strawmen.
