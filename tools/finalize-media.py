"""Finalises the media library: records dimensions, separates small icons, rebuilds the manifest."""
import json, os, shutil, hashlib
from collections import defaultdict
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

m = json.load(open("media/manifest.json", encoding="utf-8"))
ICON_MIN_WIDTH = 900
icons_dir = os.path.join("media", "icons")
os.makedirs(icons_dir, exist_ok=True)

stats = defaultdict(lambda: {"n": 0, "bytes": 0, "usable": 0})
hash_seen = {}
dupes = 0

for rec in m["images"]:
    p = os.path.join("media", rec["file"])
    if not os.path.exists(p):
        rec["error"] = "missing on disk"
        continue
    try:
        with Image.open(p) as im:
            w, h = im.size
            fmt = im.format
    except Exception as e:
        rec["error"] = f"unreadable: {e}"
        continue

    rec.update(width=w, height=h, format=fmt, bytes=os.path.getsize(p))

    # duplicate content
    dg = hashlib.md5(open(p, "rb").read()).hexdigest()
    if dg in hash_seen:
        rec["duplicateOf"] = hash_seen[dg]
        dupes += 1
        continue
    hash_seen[dg] = rec["file"]

    cat = rec["category"]
    if w < ICON_MIN_WIDTH:
        rec["kind"] = "icon"
        newp = os.path.join(icons_dir, os.path.basename(p))
        if os.path.abspath(newp) != os.path.abspath(p):
            shutil.move(p, newp)
        rec["file"] = os.path.relpath(newp, "media").replace("\\", "/")
    else:
        rec["kind"] = "photo"
        stats[cat]["usable"] += 1

    stats[cat]["n"] += 1
    stats[cat]["bytes"] += rec["bytes"]

photos = [r for r in m["images"] if r.get("kind") == "photo"]
icons = [r for r in m["images"] if r.get("kind") == "icon"]

m["summary"].update({
    "photos": len(photos),
    "icons": len(icons),
    "duplicatesRemoved": dupes,
    "photoBytes": sum(r["bytes"] for r in photos),
    "byCategory": {k: {"total": v["n"], "photos": v["usable"], "MB": round(v["bytes"] / 1048576, 1)} for k, v in stats.items()},
})

json.dump(m, open("media/manifest.json", "w", encoding="utf-8"), indent=2)

print(f"photos (>= {ICON_MIN_WIDTH}px wide): {len(photos)}  ({m['summary']['photoBytes']/1048576:.1f} MB)")
print(f"icons  (<  {ICON_MIN_WIDTH}px wide): {len(icons)}")
print(f"duplicates skipped: {dupes}\n")

print("=== category breakdown (photos only) ===")
for cat in sorted(stats):
    s = stats[cat]
    print(f"  {cat:18} total {s['n']:3}   usable {s['usable']:3}   {s['bytes']/1048576:5.1f} MB")

print("\n=== hero candidates: landscape, >= 2200px wide ===")
cands = [r for r in photos if r["width"] >= 2200 and r["width"] / r["height"] >= 1.4]
cands.sort(key=lambda r: -(r["width"] * r["height"]))
for r in cands[:20]:
    print(f"  {r['width']}x{r['height']}  {r['bytes']//1024:>5}KB  [{r['category']}]  {r.get('altClean','')[:70]}")

print("\n=== widest portrait (for vertical editorial panels) ===")
port = [r for r in photos if r["height"] > r["width"] * 1.3]
port.sort(key=lambda r: -(r["height"]))
for r in port[:8]:
    print(f"  {r['width']}x{r['height']}  [{r['category']}]  {r.get('altClean','')[:70]}")

print(f"\nmanifest updated: media/manifest.json")