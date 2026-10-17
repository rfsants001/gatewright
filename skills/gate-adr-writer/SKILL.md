---
name: gate-adr-writer
description: Capture an architdecision as a short, durable ADR (context, decision, consequences).
triggers: [adr, architecture decision, why did we, record decision]
skill-kind: architecture
metadata.source: gatewright
---
# ADR writer
**When:** a choice will be expensive to reverse or future-you will ask "why".
**Do:**
1. State the context and forces (constraints, options considered) in 3-5 lines.
2. Record the decision in one sentence, active voice ("We will …").
3. List consequences — what gets easier, what gets harder, what we now can't do.
4. Number it (ADR-NNN), date it, mark status (proposed/accepted/superseded).
**Output:** one markdown file under `docs/adr/` — no essay, just the four sections.
**Guardrails:** one decision per ADR; never edit an accepted ADR — supersede it with a new one.
