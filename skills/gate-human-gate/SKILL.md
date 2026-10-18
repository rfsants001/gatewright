---
name: gate-human-gate
description: Force a human sign-off before an irreversible action ships; prove review happened.
triggers: [sign-off, needs approval, hold until reviewed, human gate, before shipping]
skill-kind: workflows
metadata.source: claude-skills-mit
---
# Human gate
**When:** a plan, migration, release, or any hard-to-undo action is about to happen.
**Do:**
1. Name the artifact under review and a specific human reviewer (a person, not "the team").
2. Collect feedback as structured items: anchor + severity (blocker/major/minor), not chat prose.
3. Refuse to mark done while any blocker is open or no named human has reviewed.
4. Record who approved and when.
**Output:** a pass/fail gate decision + the open items that still block it.
**Guardrails:** machine checks answer "do tests pass?"; this answers "did a person agree?" — never conflate them.
