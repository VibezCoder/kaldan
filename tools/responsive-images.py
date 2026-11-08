"""Generates responsive WebP variants (800 / 1400 / 2200) for each photograph."""
import os, glob, re
from PIL import Image

PUB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "kaldan-site", "public", "media")
WIDTHS = [800, 1600]

total_before = total_after = 0
for path in sorted(glob.glob(os.path.join(PUB, "*.webp"))):
    name = os.path.basename(path)
    # never treat an already-derived file as a source
    if re.search(r"-\d{3,4}\.webp$", name):
        continue
    stem = name[:-5]
    size = os.path.getsize(path)
    total_before += size
    with Image.open(path) as im:
        im = im.convert("RGB") if im.mode in ("RGBA", "P", "LA") else im
        for w in WIDTHS:
            if im.width <= w:
                continue
            h = round(im.height * w / im.width)
            out = os.path.join(PUB, f"{stem}-{w}.webp")
            im.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
            total_after += os.path.getsize(out)

print(f"source images: {total_before/1048576:.1f} MB")
print(f"variants written: {total_after/1048576:.1f} MB")
sizes = sorted(os.path.getsize(p) for p in glob.glob(os.path.join(PUB, "*.webp")))
print(f"variant count: {len(sizes)}  median: {sizes[len(sizes)//2]//1024} KB  max: {sizes[-1]//1024} KB")