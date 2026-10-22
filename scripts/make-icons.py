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

# The installer's welcome and finish pages show a 164 x 314 picture on the left; the pages in between show a
# 150 x 57 picture in the header. Both are drawn at 4x and shrunk, so the text and edges are smooth.
BRAND, POWERED = "DocuForge", "Powered by RazaZaidi.AI"
SOFT = (190, 205, 225)


def font(names, size):
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


BOLD = ("/usr/share/fonts/opentype/inter/Inter-Bold.otf", "DejaVuSans-Bold.ttf")
REGULAR = ("/usr/share/fonts/opentype/inter/Inter-Regular.otf", "DejaVuSans.ttf")

K = 4
W, H = 164 * K, 314 * K
side = Image.new("RGB", (W, H), INK)
sd = ImageDraw.Draw(side)
for y in range(H):  # a quiet vertical gradient
    shade = 18 + 26 * y / H
    sd.line((0, y, W, y), fill=(int(shade), int(shade + 14), int(shade + 40)))
sd.rectangle((0, 0, 3 * K, H), fill=ACCENT)  # thin accent edge, like a Windows 11 title accent
logo = icon(512).resize((88 * K, 88 * K), Image.LANCZOS)
side.paste(logo, (38 * K, 58 * K), logo)
sd.text((W // 2, 176 * K), BRAND, fill=PAPER, font=font(BOLD, 21 * K), anchor="mm")
sd.text((W // 2, 198 * K), "PDF tools that stay", fill=SOFT, font=font(REGULAR, 10 * K), anchor="mm")
sd.text((W // 2, 212 * K), "on your computer", fill=SOFT, font=font(REGULAR, 10 * K), anchor="mm")
sd.line((52 * K, 262 * K, 112 * K, 262 * K), fill=(60, 80, 112), width=K)
sd.text((W // 2, 280 * K), POWERED, fill=(150, 175, 210), font=font(REGULAR, 8 * K), anchor="mm")
side.resize((164, 314), Image.LANCZOS).save(OUT / "installerSidebar.bmp")

HW, HH = 150 * K, 57 * K
head = Image.new("RGB", (HW, HH), PAPER)
hd = ImageDraw.Draw(head)
mark = icon(256).resize((32 * K, 32 * K), Image.LANCZOS)
head.paste(mark, (14 * K, 12 * K), mark)
hd.text((54 * K, 24 * K), BRAND, fill=INK, font=font(BOLD, 14 * K), anchor="lm")
hd.text((54 * K, 40 * K), POWERED, fill=(96, 110, 134), font=font(REGULAR, 7 * K), anchor="lm")
head.resize((150, 57), Image.LANCZOS).save(OUT / "installerHeader.bmp")
print("wrote", sorted(p.name for p in OUT.iterdir()))
