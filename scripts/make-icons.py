"""Draws the DocuForge icon and the installer side panel. Run once: python scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path("build")
OUT.mkdir(exist_ok=True)
S = 1024  # draw large, then shrink for smooth edges
INK, PAPER, ACCENT, SPARK = (20, 34, 56), (255, 255, 255), (0, 103, 192), (255, 176, 32)


def icon(size=S):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = size / 1024
    d.rounded_rectangle((40 * k, 40 * k, 984 * k, 984 * k), radius=210 * k, fill=INK)
    # the page, with a folded corner
    page = [(270 * k, 190 * k), (610 * k, 190 * k), (770 * k, 350 * k), (770 * k, 834 * k), (270 * k, 834 * k)]
    d.polygon(page, fill=PAPER)
    d.polygon([(610 * k, 190 * k), (610 * k, 350 * k), (770 * k, 350 * k)], fill=(205, 220, 240))
    # lines of text, then the part that is "forged": the last line becomes a spark
    for i, w in enumerate((380, 320, 380, 250)):
        y = 440 + i * 72
        d.rounded_rectangle((330 * k, y * k, (330 + w) * k, (y + 28) * k), radius=14 * k, fill=ACCENT)
    cx, cy, r = 650 * k, 740 * k, 74 * k
    d.polygon([(cx, cy - r), (cx + r * 0.34, cy - r * 0.34), (cx + r, cy), (cx + r * 0.34, cy + r * 0.34),
               (cx, cy + r), (cx - r * 0.34, cy + r * 0.34), (cx - r, cy), (cx - r * 0.34, cy - r * 0.34)], fill=SPARK)
    return im


base = icon()
base.resize((512, 512), Image.LANCZOS).save(OUT / "icon.png")
base.save(OUT / "icon.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)])

# The installer's welcome and finish pages show a 164 x 314 picture on the left.
side = Image.new("RGB", (164, 314), INK)
sd = ImageDraw.Draw(side)
for y in range(314):  # a quiet vertical gradient
    shade = int(18 + 26 * y / 314)
    sd.line((0, y, 164, y), fill=(shade, shade + 14, shade + 40))
logo = icon(256).resize((96, 96), Image.LANCZOS)
side.paste(logo, (34, 60), logo)
try:
    font = ImageFont.truetype("DejaVuSans-Bold.ttf", 20)
    small = ImageFont.truetype("DejaVuSans.ttf", 10)
except OSError:
    font = small = ImageFont.load_default()
sd.text((82, 176), "DocuForge", fill=PAPER, font=font, anchor="mm")
sd.text((82, 200), "PDF tools that stay", fill=(190, 205, 225), font=small, anchor="mm")
sd.text((82, 214), "on your computer", fill=(190, 205, 225), font=small, anchor="mm")
side.save(OUT / "installerSidebar.bmp")
print("wrote", sorted(p.name for p in OUT.iterdir()))
