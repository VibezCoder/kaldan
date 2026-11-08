"""Pixel-based WCAG contrast check: samples the real background behind each text element."""
import json, os, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "capture", "contrast")
els = json.load(open(os.path.join(D, "elements.json"), encoding="utf-8"))
im = Image.open(os.path.join(D, "page.png")).convert("RGB")
W, H = im.size


def parse(c):
    n = [float(x) for x in re.findall(r"[\d.]+", c)]
    if len(n) == 4:  # rgba -> flatten over grey estimate
        a = n[3]
        n = [n[0] * a + 255 * (1 - a), n[1] * a + 255 * (1 - a), n[2] * a + 255 * (1 - a)]
    return n[:3]


def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    l1, l2 = lum(a), lum(b)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


rows = []
for e in els:
    x, y, w, h = e["x"], e["y"], e["w"], e["h"]
    if w < 6 or h < 6 or y >= H:
        continue
    box = (max(0, x), max(0, y), min(W, x + w), min(H, y + h))
    if box[2] - box[0] < 4 or box[3] - box[1] < 4:
        continue
    crop = im.crop(box)
    # median colour ~ the background, since glyphs are a minority of pixels
    small = crop.resize((min(40, crop.width), min(40, crop.height)))
    px = list(small.getdata())
    px.sort(key=lambda p: p[0] + p[1] + p[2])
    bg = px[len(px) // 2]

    fg = parse(e["color"])
    cr = ratio(fg, bg)
    large = e["size"] >= 24 or (e["size"] >= 18.66 and e["weight"] >= 700)
    need = 3.0 if large else 4.5
    rows.append((cr, need, large, e, bg, cr >= need))

rows.sort(key=lambda r: r[0])
fails = [r for r in rows if not r[5]]

print(f"text elements sampled: {len(rows)}")
print(f"below AA             : {len(fails)}\n")
print("lowest 16:")
for cr, need, large, e, bg, ok in rows[:16]:
    print(f"  {cr:5.2f}:1 need {need}  {'PASS' if ok else 'FAIL'}  {e['size']:>2}px {e['tag']:<10} \"{e['text'][:38]}\"  bg=rgb{tuple(bg)}")

if fails:
    print("\nFAILURES:")
    for cr, need, large, e, bg, ok in fails:
        print(f"  {cr:.2f}:1 (need {need}) {e['size']}px {e['tag']} \"{e['text'][:44]}\" bg=rgb{tuple(bg)} fg={e['color']}")
else:
    print("\nAll sampled text meets WCAG AA.")