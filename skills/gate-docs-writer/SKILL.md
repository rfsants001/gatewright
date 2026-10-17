---
name: gate-docs-writer
description: Write docs that match the reader's task — getting-started, how-to, or reference.
triggers: [write docs, readme, document this, how-to]
skill-kind: development
metadata.source: gatewright
---
# Docs writer
**When:** a reader can't act without guessing.
**Do:**
1. Decide the doc type: tutorial (learn), how-to (task), reference (look up), explanation (understand).
2. Lead with the outcome and a runnable example; defer rationale.
3. Match the code: same names, same idioms, real commands that work from a clean checkout.
4. Cut anything the reader won't act on.
**Output:** the smallest doc that unblocks the task.
**Guardrails:** don't mix types in one doc; verify every command/snippet actually runs.
