---
name: gate-runbook-generator
description: Write an operational runbook so anyone on-call can act without tribal knowledge.
triggers: [runbook, on-call, incident, operations, playbook]
skill-kind: workflows
metadata.source: claude-skills-mit
---
# Runbook generator
**When:** a service goes to production or an incident revealed missing ops docs.
**Do:**
1. Describe the service in one paragraph: what it does, deps, where it runs.
2. For each known failure: symptom → diagnosis steps → remediation → escalation.
3. List the dashboards, logs, and commands by name, copy-pasteable.
4. State rollback and "who to call" explicitly.
**Output:** a runbook a new on-call can follow cold.
**Guardrails:** every step must be concrete (real command/link); "investigate the issue" is not a step.
