"""Validates the harvested media: format, dimensions, duplicates, category sanity."""
import json, os, glob
from collections import Counter, defaultdict
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

m = json.load(open("media/manifest.json", encoding="utf-8"))
imgs = m["images"]

errors = [i for i in imgs if i.get("error")]
print(f"records: {len(imgs)}   errors: {len(errors)}")
for e in errors[:5]:
    print("  ", e["file"], e["error"])

sizes = Counter()
dims = []
total = 0
by_cat = defaultdict(list)
for i in imgs:
    p = os.path.join("media", i["file"])
    if not os.path.exists(p):
        sizes["MISSING"] += 1
        continue
    total += os.path.getsize(p)
    try:
        im = Image.open(p)
        im.verify()
        im = Image.open(p)
        w, h = im.size
        dims.append((w, h))
        sizes[im.format] += 1
        by_cat[i["category"]].append((w, h, os.path.getsize(p), i["alt"][:60]))
    except Exception as ex:
        sizes["CORRUPT"] += 1
        print("  corrupt:", i["file"], ex)

print("\nformats:", dict(sizes))
print(f"total on disk: {total/1048576:.1f} MB")
if dims:
    ws = [d[0] for d in dims]; hs = [d[1] for d in dims]
    print(f"width  min/med/max: {min(ws)} / {sorted(ws)[len(ws)//2]} / {max(ws)}")
    print(f"height min/med/max: {min(hs)} / {sorted(hs)[len(hs)//2]} / {max(hs)}")
    print(f"aspect ratios (w/h) sample: {[round(w/h,2) for w,h in dims[:12]]}")

print("\n=== per category ===")
for cat, items in sorted(by_cat.items()):
    tot = sum(x[2] for x in items)
    print(f"\n{cat}: {len(items)} images, {tot/1048576:.1f} MB")
    for w, h, b, alt in items[:4]:
        print(f"   {w}x{h}  {b//1024:>5}KB  {alt}")

# duplicate detection by content hash
import hashlib
hashes = Counter()
for i in imgs:
    p = os.path.join("media", i["file"])
    if os.path.exists(p):
        hashes[hashlib.md5(open(p, "rb").read()).hexdigest()] += 1
dupes = {k: v for k, v in hashes.items() if v > 1}
print(f"\nexact duplicate files: {len(dupes)}")

print("\n=== videos ===")
for v in m["videos"]:
    p = os.path.join("media", v["file"])
    ok = os.path.exists(p)
    print(f"  {'OK ' if ok else 'MISS'} {v.get('bytes',0)/1048576:6.1f} MB  {os.path.basename(v['file'])}")