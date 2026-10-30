# Generates Android launcher icons from ../images/icon-512.png
import os, sys
from PIL import Image, ImageDraw

SRC = os.path.join(os.path.dirname(__file__), "..", "images", "icon-512.png")
RES = os.path.join(os.path.dirname(__file__), "android", "app", "src", "main", "res")
src = Image.open(SRC).convert("RGBA")

# density: (legacy launcher px = 48dp, adaptive foreground px = 108dp)
dens = {"mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
        "xxhdpi": (144, 324), "xxxhdpi": (192, 432)}

for d, (leg, fg) in dens.items():
    out = os.path.join(RES, f"mipmap-{d}")
    os.makedirs(out, exist_ok=True)
    # legacy square icon
    sq = src.resize((leg, leg), Image.LANCZOS)
    sq.save(os.path.join(out, "ic_launcher.png"))
    # legacy round icon
    big = src.resize((leg * 4, leg * 4), Image.LANCZOS)
    mask = Image.new("L", big.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
    big.putalpha(mask)
    big.resize((leg, leg), Image.LANCZOS).save(os.path.join(out, "ic_launcher_round.png"))
    # adaptive foreground: full icon fills the 108dp canvas (launcher masks the edges)
    src.resize((fg, fg), Image.LANCZOS).save(os.path.join(out, "ic_launcher_foreground.png"))
print("icons generated")
