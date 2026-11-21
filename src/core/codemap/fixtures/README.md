# Real Graphify fixture

`graphify-0.9.114.json` was generated on Linux with Python 3.14.4 and `graphifyy[mcp]==0.9.114` in a disposable environment on 2026-11-21. No API key or LLM was used. Its input was:

```ts
export function greet(name: string) { return `Hello ${name}`; }
export function run() { return greet("World"); }
```

The file was `src/hello.ts`. The verified command is:

```sh
python -m graphify extract . --code-only --no-cluster --out .
```

This package emits `nodes` and `edges` without a version metadata block in this mode. The adapter also accepts `links` and schema 1, as described by the [upstream exporter](https://github.com/Graphify-Labs/graphify/blob/b582ad401aaef4378935ec6620e3b165ae8e03c1/graphify/export.py) and [CLI](https://github.com/Graphify-Labs/graphify/blob/b582ad401aaef4378935ec6620e3b165ae8e03c1/graphify/cli.py). Unknown future schema versions are rejected.

`--out` is an output root, so `--out graphify-out` creates a nested graphify-out directory in this release. Gatewright uses `--out .`. Production generation was exercised through `generateCodeMap`; installation, version verification and cleanup were separately exercised through `applyIntegration`, `inspectOperation` and `recoverOperation`.
