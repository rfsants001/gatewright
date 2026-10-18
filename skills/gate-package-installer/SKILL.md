---
name: gate-package-installer
description: Install and configure an external tool or app into the environment from a repo URL or name — read the project, pick the documented install method, run it, verify, and report how to use it.
triggers: [install from github, install this repo, add this tool, set up this package, install from url]
skill-kind: provisioning
metadata.source: gatewright
---
# Package installer
**When:** the user hands you a repo URL or a tool name and wants it installed + configured here.
**Do:**
1. Identify the project — fetch/read its README and manifest (package.json, pyproject.toml, Cargo.toml, go.mod, Makefile, or INSTALL docs). Say what it is in one line.
2. Pick the install method the project itself documents (npm/pnpm · pipx/pip --user · cargo · go install · docker · official script). Prefer the official, user-scoped one.
3. Install it, then configure the minimum to make it usable (PATH, a config file, env vars) — and note where that config lives.
4. Verify it actually runs (`--version`/`--help`) and report exactly what you did and how to use it.
**Output:** an installed, verified tool + a short "how to use" note, and the config location.
**Guardrails:** show any `curl … | sh` script before running it; never do anything destructive or system-wide without confirming; prefer user-scoped installs; if the repo looks unsafe or unclear, stop and report instead of guessing.
