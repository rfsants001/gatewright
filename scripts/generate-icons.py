"""Regenerate platform icons from the existing Gatewright vector mark.

Developer utility only: pip install pillow cairosvg. Normal builds use tracked assets.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

root = Path(__file__).resolve().parents[1]
assets = root / "build"
image = Image.open(BytesIO(cairosvg.svg2png(url=str(assets / "icon.svg"), output_width=1024, output_height=1024))).convert("RGBA")
image.save(assets / "icon.png")
image.save(assets / "icon.ico", format="ICO", sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
image.save(assets / "icon.icns", format="ICNS")
(assets / "icons").mkdir(exist_ok=True)
for size in (16, 24, 32, 48, 64, 128, 256, 512):
    image.resize((size, size), Image.Resampling.LANCZOS).save(assets / "icons" / f"{size}x{size}.png")
