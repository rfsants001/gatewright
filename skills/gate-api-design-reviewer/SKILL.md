---
name: gate-api-design-reviewer
description: Review an API for consistency, versioning and breaking changes before it ships.
triggers: [api review, rest api, endpoint design, breaking change, api versioning]
skill-kind: quality
metadata.source: claude-skills-mit
---
# API design reviewer
**When:** a change adds or alters endpoints, or an API is heading to v2.
**Do:**
1. Check conventions: naming, pluralization, status codes, pagination, error shape — consistent across endpoints.
2. Diff against the current contract; flag breaking changes (removed fields, changed types, tightened validation).
3. Verify versioning + deprecation path for anything breaking.
4. Score: consistency, backward-compat, documentation, error handling.
**Output:** findings tied to endpoints + a go/no-go on breaking changes.
**Guardrails:** a breaking change without a version bump + migration path is a blocker.
