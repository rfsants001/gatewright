---
name: gate-observability-designer
description: Design logs, metrics and traces so failures are diagnosable in production.
triggers: [observability, logging, metrics, tracing, monitoring, slo]
skill-kind: architecture
metadata.source: claude-skills-mit
---
# Observability designer
**When:** building or hardening a service that others will have to operate.
**Do:**
1. Start from the questions on-call will ask at 3am; instrument to answer them.
2. Metrics for rates/errors/duration; structured logs with correlation ids; traces across boundaries.
3. Define a few SLOs and alert on symptoms (user-facing), not causes (CPU).
4. Make every alert actionable and linked to a runbook.
**Output:** an instrumentation plan: signals, SLOs, and alerts that map to actions.
**Guardrails:** don't log secrets or PII; an alert nobody can act on is noise — delete it.
