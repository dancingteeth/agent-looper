#!/usr/bin/env python3
"""Rasterize site/favicon.svg into ICO and apple-touch-icon PNG."""

from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SVG = SITE / "favicon.svg"


def svg_to_png(size: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(url=str(SVG), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png_bytes)).convert("RGBA")


def write_favicon_ico() -> None:
    sizes = [16, 32]
    images = [svg_to_png(s) for s in sizes]
    images[0].save(
        SITE / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )


def write_apple_touch_icon() -> None:
    svg_to_png(180).save(SITE / "apple-touch-icon.png", format="PNG")


def main() -> None:
    write_favicon_ico()
    write_apple_touch_icon()
    print("Wrote favicon.ico, apple-touch-icon.png")


if __name__ == "__main__":
    main()
