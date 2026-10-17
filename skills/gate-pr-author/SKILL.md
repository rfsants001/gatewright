---
name: gate-pr-author
description: Write a PR description a reviewer can approve without a meeting.
triggers: [pr description, pull request, open a pr, changelog entry]
skill-kind: development
metadata.source: gatewright
---
# PR author
**When:** a change is ready for review.
**Do:**
1. Title: imperative, scoped (`feat(scope): …`).
2. Body: what changed and why, in that order; link the spec/issue.
3. Call out risk, migrations, and how you verified (tests, manual steps).
4. Keep the diff focused — unrelated cleanups go in their own PR.
**Output:** a description that answers the reviewer's questions before they ask.
**Guardrails:** no "misc fixes" PRs; if you can't summarize it in a sentence, it's too big.
