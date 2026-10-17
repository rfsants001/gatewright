---
name: gate-debugger
description: Find root cause by forming and killing hypotheses, not by guessing.
triggers: [debug, why is this failing, root cause, flaky, repro]
skill-kind: quality
metadata.source: gatewright
---
# Debugger
**When:** behavior differs from expectation and the cause isn't obvious.
**Do:**
1. Reproduce it reliably; shrink to the smallest failing case.
2. Write down the expected vs actual and 2-3 hypotheses.
3. Make one observation that eliminates a hypothesis (log, breakpoint, bisect).
4. Fix the cause, add a test that would have caught it, then revert your debug scaffolding.
**Output:** root cause, the fix, and a regression test.
**Guardrails:** don't fix symptoms; if you can't repro, you can't claim it's fixed.
