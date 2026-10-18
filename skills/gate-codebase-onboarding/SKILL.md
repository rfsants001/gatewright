---
name: gate-codebase-onboarding
description: Map an unfamiliar codebase fast — entry points, architecture, and where to make a change.
triggers: [onboard, new codebase, understand this repo, where is, how does this work]
skill-kind: development
metadata.source: claude-skills-mit
---
# Codebase onboarding
**When:** starting in a repo you don't know and about to change it.
**Do:**
1. Find the entry points (bin/main/server) and follow one real request/flow end-to-end.
2. Sketch the module boundaries and the data model from the code, not the README.
3. Locate the tests and the build/run commands; get it running locally.
4. Identify exactly where your change belongs and what it touches.
**Output:** a short map (flow + boundaries) and the file(s) you'll edit.
**Guardrails:** trust the code over stale docs; verify your mental model by running it before changing it.
