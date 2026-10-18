---
name: gate-flow
description: Drive a change end-to-end under the gate — plan with SDD, get human sign-off, implement task by task, review, confirm, then branch/commit/push and open the PR — pausing for the user via <gate-ask> blocks whenever a human decision is needed.
triggers: [end to end, full flow, idea to pr, drive the whole thing, ship this feature]
skill-kind: workflows
metadata.source: gatewright
---
# Flow (end-to-end)
**When:** a goal must go from idea to a merge-ready change, with the human in the loop at the right moments.
**Do:**
1. **Plan (SDD)** — follow gate-sdd-phase: turn the goal into a spec + atomic tasks. If anything is ambiguous, ask (step 2) instead of guessing.
2. **Ask the human** — when you need a choice, missing info, or approval, STOP and emit a `<gate-ask>` block (schema below). Wait for the answer before continuing.
3. **Sign-off** — present the plan and get explicit approval (a `confirm` question) before writing code.
4. **Implement** — task by task (gate-sdd-execute); keep build + tests green; one task = one commit.
5. **Review** — run gate-code-review on the diff; fix findings.
6. **Confirm & ship** — a final `confirm` before shipping; then branch, commit, push, and open the PR (gate-pr-author).

**Asking the human — emit EXACTLY this block and stop:**
```
<gate-ask>
{"questions":[
  {"id":"scope","type":"select","prompt":"Which scope?","options":["MVP","Full"]},
  {"id":"areas","type":"multiselect","prompt":"Which areas?","options":["api","ui","db"]},
  {"id":"notes","type":"text","prompt":"Any constraints?"},
  {"id":"go","type":"confirm","prompt":"Approve this plan?"}
]}
</gate-ask>
```
**Output:** a merge-ready change with every human checkpoint honored.
**Guardrails:** never skip the sign-off before implementing or the confirm before pushing; never fabricate an answer the human didn't give.
