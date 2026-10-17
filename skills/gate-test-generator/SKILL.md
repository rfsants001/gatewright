---
name: gate-test-generator
description: Generate tests that pin behavior and cover the edges that matter.
triggers: [write tests, test cases, coverage, unit test]
skill-kind: quality
metadata.source: gatewright
---
# Test generator
**When:** behavior is worth locking in or a bug just slipped through.
**Do:**
1. Start from the contract: inputs → expected outputs, and the invariants.
2. Cover the happy path, the boundaries (empty/one/many, min/max), and the error paths.
3. One behavior per test; name the test after the behavior, not the function.
4. Make them deterministic — no clocks, no network, no order-dependence.
**Output:** focused tests that fail for the right reason.
**Guardrails:** don't test implementation details; coverage is a hint, not the goal.
