"""Frame real Electron captures for the README; never invent or edit screen data.

Developer utility: Pillow + fontTools[woff] (not required by normal app builds).
Usage: python3 scripts/generate-readme-banners.py <evolution-dir> <pending-dir>
"""
import argparse
import hashlib
import json
from datetime import date
from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCREENS = [
    ("project", "project", "Project workspace", "One repository, connected tools and recorded activity"),
    ("pending", "pending-overview", "Pending work", "Reviews, interrupted flows and installation diagnostics"),
    ("memory", "memory", "Versioned memory", "Choose context explicitly and preserve the original run snapshot"),
    ("map", "map", "Code map", "Explore symbols, relationships, files and their Git diff"),
    ("tasks", "codex-tasks", "Codex task execution", "Workspace edits, tool events and a persistent task history"),
    ("review", "codex-review", "Diff review", "Inspect the current changes before recording a decision"),
    ("flow", "codex-flow", "Guided SDD flow", "Human decisions between planning and implementation"),
    ("costs", "costs", "Usage and costs", "One period across daily charts, attribution and run details"),
    ("integrations", "integrations", "Integration workspace", "Review installation recipes, providers and resource ownership"),
    ("connections", "codex-connections", "Terminal connections", "Check native Codex hook trust before starting a task"),
    ("agents", "agents", "Agent composer", "Give a role its responsibilities and ordered skills"),
    ("skills", "skills", "Skills library", "Reusable project instructions with search and dependencies"),
    ("responsive", "compact-tasks", "Compact desktop", "Narrow window, wrapped navigation and stacked task panels"),
]


def font(size, weight=400):
    source = ROOT / "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"
    face = TTFont(source)
    face.flavor = None
    buffer = BytesIO()
    face.save(buffer)
    buffer.seek(0)
    result = ImageFont.truetype(buffer, size)
    result.set_variation_by_axes([weight])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evolution", type=Path)
    parser.add_argument("pending", type=Path)
    parser.add_argument("--date", default=date.today().isoformat(), help="Capture date shown on the banners")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/screenshots")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    title_font, sub_font, label_font = font(30, 600), font(15), font(12, 500)
    logo = Image.open(ROOT / "build/icon.png").convert("RGBA")
    logo.thumbnail((40, 40), Image.Resampling.LANCZOS)
    total_bytes = 0
    manifest = {"capturedOn": args.date, "data": "Disposable fixtures; no authenticated provider billing", "screens": []}
    for index, (name, source, title, subtitle) in enumerate(SCREENS, 1):
        directory = args.pending if name == "pending" else args.evolution
        capture = Image.open(directory / f"{source}.png").convert("RGB")
        capture.thumbnail((1440, 1440), Image.Resampling.LANCZOS)
        width, height = capture.size
        margin, header, footer = 32, 122, 52
        canvas = Image.new("RGB", (width + margin * 2, height + header + footer), "#101014")
        draw = ImageDraw.Draw(canvas)
        canvas.paste(logo, (margin, 30), logo)
        draw.text((margin + 54, 23), "GATEWRIGHT / DESKTOP", font=label_font, fill="#fd82c6")
        draw.text((margin + 54, 43), title, font=title_font, fill="#f5f2f7")
        draw.text((margin, 91), subtitle, font=sub_font, fill="#aaa4af")
        label = f"{index:02d} / {len(SCREENS):02d}   ·   TEST DATA"
        draw.text((canvas.width - margin, 35), label, anchor="rt", font=label_font, fill="#c69bb8")
        canvas.paste(capture, (margin, header))
        draw.rounded_rectangle((margin - 1, header - 1, margin + width, header + height), radius=10, outline="#39323b", width=1)
        draw.text((margin, header + height + 18), "Captured from Electron · Disposable project · Fixture data", font=label_font, fill="#aaa4af")
        draw.text((canvas.width - margin, header + height + 18), args.date, anchor="rt", font=label_font, fill="#c69bb8")
        target = args.output / f"gatewright-{name}.webp"
        canvas.save(target, "WEBP", quality=91, method=6)
        total_bytes += target.stat().st_size
        raw = directory / f"{source}.png"
        manifest["screens"].append({"banner": target.name, "capture": f"{'pending' if name == 'pending' else 'evolution'}/{raw.name}", "captureSha256": hashlib.sha256(raw.read_bytes()).hexdigest(), "bannerSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "width": canvas.width, "height": canvas.height})
        print(f"{target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}: {canvas.width}x{canvas.height}")
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(SCREENS)} banners, {total_bytes / 1024:.0f} KiB total")


if __name__ == "__main__":
    main()
