---
name: gate-focused-fix
description: Systematically repair a whole feature/module end-to-end, not a single symptom.
triggers: [make X work, fix the feature, module is broken, deep fix]
skill-kind: development
metadata.source: claude-skills-mit
---
# Focused fix
**When:** an entire feature/area is broken and a one-line patch won't cut it.
**Do:**
1. Map the feature's full surface: entry points, dependencies, data, tests, logs.
2. Reproduce every failure mode; list them before touching code.
3. Fix causes in dependency order, keeping the build + tests green after each.
4. Add regression tests for each failure mode you closed.
**Output:** the feature working end-to-end with tests proving each mode is fixed.
**Guardrails:** for a single isolated bug use gate-debugger; don't expand scope beyond the named feature.
