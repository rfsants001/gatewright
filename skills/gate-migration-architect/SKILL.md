---
name: gate-migration-architect
description: Plan a risky migration as safe, reversible, independently-shippable stages.
triggers: [migration, migrate, cutover, upgrade, move off]
skill-kind: architecture
metadata.source: claude-skills-mit
---
# Migration architect
**When:** replacing a system, schema, framework, or provider that's in use.
**Do:**
1. State the end state and the invariants that must hold throughout.
2. Prefer expand/contract: add the new path, dual-write/read, migrate, then remove the old.
3. Make each stage independently shippable and reversible; define the rollback for each.
4. Add a verification per stage (data parity, behavior parity) before advancing.
**Output:** a staged plan where no single step is a cliff.
**Guardrails:** never a big-bang cutover without a tested rollback; keep old + new coexisting until parity is proven.
