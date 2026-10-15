#!/usr/bin/env python3
"""Detect a local LLM endpoint (Ollama / LM Studio) for Jev.

Installs nothing: it only probes already-running local servers using the stdlib
and prints a JSON report. The MCP server (or configure.py) consumes this to point
Jev at a live endpoint.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

# (label, base_url, models_path, response_key)
CANDIDATES = [
    ("ollama", "http://localhost:11434", "/api/tags", "models"),
    ("lmstudio", "http://localhost:1234", "/v1/models", "data"),
]


def _probe(base: str, path: str) -> dict | None:
    try:
        with urllib.request.urlopen(base + path, timeout=2) as resp:  # noqa: S310 (localhost only)
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return None


def detect() -> list[dict]:
    found = []
    for label, base, path, key in CANDIDATES:
        body = _probe(base, path)
        if body is None:
            continue
        raw = body.get(key, []) if isinstance(body, dict) else []
        models = [m.get("name") or m.get("id") for m in raw if isinstance(m, dict)]
        found.append({"label": label, "endpoint": base, "models": [m for m in models if m]})
    return found


def main() -> int:
    endpoints = detect()
    print(json.dumps({"detected": endpoints}, indent=2))
    return 0 if endpoints else 1


if __name__ == "__main__":
    sys.exit(main())
