---
name: gate-security-review
description: Check a change for the common ways code leaks, trusts, or executes too much.
triggers: [security, vulnerability, secrets, injection, authz]
skill-kind: quality
metadata.source: gatewright
---
# Security review
**When:** a change handles input, secrets, auth, or runs external commands.
**Do:**
1. Trace untrusted input to every sink (shell, SQL, filesystem, eval, HTML).
2. Check authn/authz on each new path; default deny.
3. Look for secrets in code/logs and over-broad permissions/scopes.
4. Confirm errors don't leak internals and dependencies aren't obviously stale.
**Output:** concrete findings with the exploit path and the fix.
**Guardrails:** assume input is hostile; absence of a finding is not proof of safety.
