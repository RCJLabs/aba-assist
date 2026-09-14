#!/usr/bin/env python3
"""
Generate the PWA icon set.

Committed so the mark is reproducible and adjustable rather than a set of binaries
nobody can regenerate. Requires Pillow, which is not a project dependency — this runs
rarely and by hand:

    pip install Pillow && python3 scripts/make-icons.py

Keep `static/favicon.svg` in step with any change here: the tab icon and the home-screen
icon should read as the same mark.
"""

from PIL import Image, ImageDraw

NAVY = (27, 58, 92, 255)
WHITE = (255, 255, 255, 255)
SKY = (156, 198, 242, 255)

# Drawn large and downsampled, because Pillow has no anti-aliased shape rendering.
SUPERSAMPLE = 8


def draw_glyph(d: ImageDraw.ImageDraw, size: int, inset: float = 0.0) -> None:
    """
    A bold 'A' over a rising data trend.

    Deliberately not an 'A' + 'i' lockup: at icon size that reads as "Ai", implying
    artificial intelligence, which is the opposite of what this app is. The ascending
    points nod at data collection, which is what the work actually involves.

    `inset` shrinks the artwork for the maskable variant, whose outer ~20% can be cropped
    into a circle or squircle by the launcher.
    """
    k = 1.0 - inset

    def X(v: float) -> float:
        """Map the 0..64 design grid onto the canvas, centred and scaled by k."""
        return (v / 64.0 - 0.5) * k * size + size / 2

    stroke = int(size * 0.095 * k)

    d.line([(X(18), X(41)), (X(32), X(12))], fill=WHITE, width=stroke, joint="curve")
    d.line([(X(32), X(12)), (X(46), X(41))], fill=WHITE, width=stroke, joint="curve")
    d.line([(X(24), X(32)), (X(40), X(32))], fill=WHITE, width=stroke)

    points = [(X(17), X(54)), (X(27), X(51)), (X(37), X(53)), (X(47), X(47))]
    d.line(points, fill=SKY, width=max(2, int(size * 0.028 * k)), joint="curve")
    r = size * 0.035 * k
    for cx, cy in points:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=SKY)


def make(size: int, path: str, maskable: bool = False) -> None:
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # A maskable icon must fill the whole square — the launcher crops the shape it
        # wants. Rounding the corners here would get them cut off and look wrong.
        d.rectangle([0, 0, s, s], fill=NAVY)
        draw_glyph(d, s, inset=0.22)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.1875), fill=NAVY)
        draw_glyph(d, s)

    img.resize((size, size), Image.LANCZOS).save(path, "PNG", optimize=True)
    print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    make(192, "static/icons/icon-192.png")
    make(512, "static/icons/icon-512.png")
    make(512, "static/icons/maskable-512.png", maskable=True)
    make(180, "static/icons/apple-touch-icon.png")
