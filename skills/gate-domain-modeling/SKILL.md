---
name: gate-domain-modeling
description: Find the bounded contexts, aggregates and ubiquitous language of a domain.
triggers: [ddd, domain model, bounded context, aggregate, entities]
skill-kind: architecture
metadata.source: gatewright
---
# Domain modeling
**When:** the code's nouns are fuzzy or one module knows too much about another.
**Do:**
1. List the domain nouns and the language the business actually uses.
2. Group them into bounded contexts; name the boundary and its responsibility.
3. Within a context, pick aggregates (consistency boundaries) and their invariants.
4. Mark where contexts integrate and the contract between them.
**Output:** a short map (text or mermaid) of contexts → aggregates → invariants.
**Guardrails:** model behavior and invariants, not database tables; keep aggregates small.
