---
name: gate-performance-profiler
description: Find and fix the real hot path with measurements, not guesses.
triggers: [slow, performance, optimize, profile, latency, bottleneck]
skill-kind: quality
metadata.source: claude-skills-mit
---
# Performance profiler
**When:** something is measurably slow and you're tempted to guess why.
**Do:**
1. Define the metric and target (p95 latency, throughput, memory) before touching code.
2. Measure under a realistic load; find the dominant cost with a profiler, not intuition.
3. Fix the top cost; re-measure to confirm the win is real.
4. Stop when you hit the target; note the next bottleneck for later.
**Output:** before/after numbers + the one change that moved them.
**Guardrails:** no optimization without a measurement proving it helped; don't trade clarity for micro-gains.
