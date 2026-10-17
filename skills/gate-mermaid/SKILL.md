---
name: gate-mermaid
description: Turn a system or flow into a clear mermaid diagram.
triggers: [diagram, mermaid, flowchart, sequence diagram, visualize]
skill-kind: development
metadata.source: gatewright
---
# Mermaid
**When:** words are getting long and a picture would be shorter.
**Do:**
1. Pick the right type: flowchart (control), sequence (interaction over time), ER (data), state (lifecycle).
2. Name nodes with domain terms, not variable names.
3. Keep it under ~12 nodes; split into sub-diagrams if it sprawls.
4. Render-check the syntax before shipping.
**Output:** a fenced ```mermaid block that renders on first try.
**Guardrails:** a diagram replaces prose only if it's simpler than the prose.
