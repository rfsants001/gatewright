---
name: gate-rfc-writer
description: Draft an RFC to socialize a design before building it.
triggers: [rfc, design doc, proposal, socialize design]
skill-kind: architecture
metadata.source: gatewright
---
# RFC writer
**When:** a change affects others and you want feedback before committing to it.
**Do:**
1. Problem statement + goals/non-goals.
2. Proposed design, with at least one considered alternative and why it lost.
3. Risks, migration/rollout, and open questions.
4. Keep it skimmable — headings, short paragraphs, a diagram if it helps.
**Output:** `docs/rfc/NNN-title.md`, status-tracked.
**Guardrails:** an RFC is for decisions still open; once accepted, distill the outcome into an ADR.
