#!/usr/bin/env python3
"""Rasterize site/favicon.svg into ICO, apple-touch-icon, and OG card PNG."""

from __future__ import annotations

import io
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

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


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def write_og_image() -> None:
    width, height = 1200, 630
    canvas = Image.new("RGB", (width, height), "#000000")
    draw = ImageDraw.Draw(canvas)

    mark_size = 220
    mark = svg_to_png(mark_size)
    mark_x = 120
    mark_y = (height - mark_size) // 2
    canvas.paste(mark, (mark_x, mark_y), mark)

    text_x = mark_x + mark_size + 72
    title_font = load_font(72, bold=True)
    subtitle_font = load_font(36, bold=False)

    title = "Agent Looper"
    subtitle = "Finally, you're not the verify step."

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    title_h = title_bbox[3] - title_bbox[1]
    subtitle_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    subtitle_h = subtitle_bbox[3] - subtitle_bbox[1]
    gap = 24
    block_h = title_h + gap + subtitle_h
    title_y = (height - block_h) // 2

    draw.text((text_x, title_y), title, fill="#FFFFFF", font=title_font)
    draw.text((text_x, title_y + title_h + gap), subtitle, fill="#8A8580", font=subtitle_font)

    canvas.save(SITE / "og.png", format="PNG", optimize=True)


def main() -> None:
    write_favicon_ico()
    write_apple_touch_icon()
    write_og_image()
    print("Wrote favicon.ico, apple-touch-icon.png, og.png")


if __name__ == "__main__":
    main()
