#!/usr/bin/env python3
"""Generate the frog icon set for the extension (Virio-branded cream tile + green frog).
Run: python3 make_icons.py  → writes icons/icon16|32|48|128.png"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")
os.makedirs(OUT, exist_ok=True)

# Virio palette
CREAM = (255, 249, 237, 255)
INK   = (27, 27, 24, 255)
GOLD  = (213, 180, 115, 255)
FROG  = (95, 150, 78, 255)     # muted natural green, harmonizes with cream
FROG_D= (63, 110, 52, 255)     # shade
WHITE = (255, 253, 248, 255)

S = 512  # supersample master size

def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def master():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # background tile
    pad = int(S * 0.045)
    rr(d, [pad, pad, S - pad, S - pad], int(S * 0.235), fill=CREAM, outline=INK, width=int(S*0.028))
    # gold baseline accent (Virio signature)
    d.rectangle([int(S*0.30), int(S*0.84), int(S*0.70), int(S*0.86)], fill=GOLD)

    cx = S * 0.5
    # --- frog head: rounded body ---
    hw, hh = S * 0.62, S * 0.50
    hy = S * 0.60
    rr(d, [cx - hw/2, hy - hh/2, cx + hw/2, hy + hh/2], int(S*0.24), fill=FROG)
    # cheeks shade
    d.ellipse([cx - hw/2 + S*0.02, hy + S*0.02, cx - hw/2 + S*0.20, hy + S*0.20], fill=FROG_D)
    d.ellipse([cx + hw/2 - S*0.20, hy + S*0.02, cx + hw/2 - S*0.02, hy + S*0.20], fill=FROG_D)

    # --- eyes: two bulbs on top ---
    er = S * 0.16                     # eye radius
    eyoff = S * 0.20                  # horizontal offset from center
    eyc = hy - hh/2 - S*0.02          # eye center y (sits above head)
    for sx in (-1, 1):
        ecx = cx + sx * eyoff
        # green socket
        d.ellipse([ecx - er, eyc - er, ecx + er, eyc + er], fill=FROG)
        # white
        wr = er * 0.72
        d.ellipse([ecx - wr, eyc - wr, ecx + wr, eyc + wr], fill=WHITE)
        # pupil
        pr = er * 0.34
        d.ellipse([ecx - pr, eyc - pr + er*0.05, ecx + pr, eyc + pr + er*0.05], fill=INK)

    # --- smile ---
    mw = S * 0.30
    my = hy + S * 0.12
    d.arc([cx - mw, my - S*0.10, cx + mw, my + S*0.10], start=15, end=165, fill=INK, width=int(S*0.030))
    # nostrils
    for sx in (-1, 1):
        nx = cx + sx * S*0.05
        d.ellipse([nx - S*0.012, my - S*0.05, nx + S*0.012, my - S*0.02], fill=FROG_D)
    return img

m = master()
for sz in (16, 32, 48, 128):
    m.resize((sz, sz), Image.LANCZOS).save(os.path.join(OUT, f"icon{sz}.png"))
    print("wrote", f"icons/icon{sz}.png")
