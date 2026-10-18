---
name: gate-sdd-state
description: Record a decision, blocker, deferred idea, or lesson in STATE so context survives.
triggers: [sdd state, log a decision, record blocker, note for later, lessons learned]
skill-kind: sdd
metadata.source: gatewright
---
# SDD · state
**When:** something non-obvious was decided, blocked, deferred, or learned.
**Do:**
1. Pick the bucket: decision · blocker · deferred · lesson.
2. Write it so future-you acts correctly without re-deriving it — convert relative dates to absolute.
3. For a decision, record the why and the alternative rejected; for a lesson, the rule to apply next time.
4. Keep STATE current — delete entries that stopped being true.
**Output:** an updated `STATE.md` that reflects reality.
**Guardrails:** don't log what the code/git already records; capture only what isn't derivable.
