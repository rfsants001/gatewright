#!/usr/bin/env python3
"""Write Jev's runtime config (the file the MCP server reads).

Installs nothing: it only merges flags into the JSON config at
$GATEWRIGHT_JEV_CONFIG (default ~/.gatewright/jev.config.json), matching the shape
in src/core/jev/config-store.ts. If no --endpoint/--model is given, it falls back
to detect.py's first result.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

DEFAULT_CONFIG = {
    "enabled": False,
    "endpoint": "http://localhost:11434",
    "model": "llama3.2",
    "budget": {},
}


def config_path() -> Path:
    env = os.environ.get("GATEWRIGHT_JEV_CONFIG")
    return Path(env) if env else Path.home() / ".gatewright" / "jev.config.json"


def load(path: Path) -> dict:
    if not path.exists():
        return dict(DEFAULT_CONFIG)
    try:
        current = json.loads(path.read_text("utf-8"))
    except (ValueError, OSError):
        return dict(DEFAULT_CONFIG)
    return {**DEFAULT_CONFIG, **current, "budget": {**DEFAULT_CONFIG["budget"], **current.get("budget", {})}}


def parse_budget(pairs: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for pair in pairs:
        feature, _, limit = pair.partition("=")
        out[feature] = int(limit)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the local Jev engine.")
    parser.add_argument("--endpoint")
    parser.add_argument("--model")
    parser.add_argument("--enabled", choices=["true", "false"])
    parser.add_argument("--budget", action="append", default=[], metavar="FEATURE=N")
    parser.add_argument("--auto-detect", action="store_true", help="fill endpoint/model from detect.py")
    args = parser.parse_args()

    path = config_path()
    cfg = load(path)

    if args.auto_detect and not (args.endpoint and args.model):
        import detect  # sibling module

        hits = detect.detect()
        if hits:
            cfg["endpoint"] = hits[0]["endpoint"]
            if hits[0]["models"]:
                cfg["model"] = hits[0]["models"][0]

    if args.endpoint:
        cfg["endpoint"] = args.endpoint
    if args.model:
        cfg["model"] = args.model
    if args.enabled:
        cfg["enabled"] = args.enabled == "true"
    if args.budget:
        cfg["budget"] = {**cfg["budget"], **parse_budget(args.budget)}

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, indent=2), "utf-8")
    print(json.dumps(cfg, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
