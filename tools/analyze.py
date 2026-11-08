"""
Evidential audit of the captured Kaldan homepage.

Reads the screenshots, the mirror manifest, the rendered DOM and the CSS,
then writes audit-data.json plus a readable summary.
"""
import json
import re
import glob
import os
from collections import Counter, defaultdict
from PIL import Image
from lxml import html as LH

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

out = {}

def jload(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

# ---------------------------------------------------------------- 1. images
print("=" * 78)
print("1. SCREENSHOT VERIFICATION (programmatic - confirms real render, not blank)")
print("=" * 78)

def check_image(path):
    if not os.path.exists(path):
        return {"path": path, "exists": False}
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((min(w, 200), max(1, int(h * min(w, 200) / w)))) if w > 0 else im
    colors = small.getcolors(maxcolors=1_000_000)
    uniq = len(colors) if colors else -1
    px = list(im.resize((60, 60)).getdata())
    # per-horizontal-band mean brightness to detect blank regions
    bands = []
    step = max(1, h // 10)
    for y in range(0, h, step):
        box = im.crop((0, y, w, min(y + step, h))).resize((20, 4))
        d = list(box.getdata())
        bands.append(round(sum(sum(p) / 3 for p in d) / len(d), 1))
    return {
        "path": os.path.relpath(path, ROOT).replace("\\", "/"),
        "exists": True,
        "size": [w, h],
        "bytes": os.path.getsize(path),
        "uniqueColors": uniq,
        "bandBrightness": bands,
        "blankBands": sum(1 for b in bands if b < 6),
    }

shots = {}
for label, p in [
    ("desktop_full", "capture/desktop/home-desktop-full.png"),
    ("mobile_full", "capture/mobile/home-mobile-full.png"),
]:
    r = check_image(p)
    shots[label] = r
    if r.get("exists"):
        print(f"  {label:14} {r['size'][0]}x{r['size'][1]}  {r['bytes']/1024/1024:.1f} MB  "
              f"uniqueColors={r['uniqueColors']}  blankBands={r['blankBands']}/10")
        print(f"                 band brightness (top->bottom): {r['bandBrightness']}")

seg = sorted(glob.glob("capture/desktop/home-desktop-segments/*.png"))
seg_info = [check_image(s) for s in seg]
print(f"\n  desktop segments: {len(seg_info)}")
for s in seg_info:
    print(f"    {os.path.basename(s['path']):22} {s['size'][0]}x{s['size'][1]}  uniq={s['uniqueColors']:6}  blank={s['blankBands']}")
out["screenshots"] = {"shots": shots, "desktop_segments": seg_info}

# ---------------------------------------------------------------- 2. manifest
print()
print("=" * 78)
print("2. ASSET WEIGHT / PAYLOAD")
print("=" * 78)
m = jload("site-code/manifest.json", {})
assets = [a for a in m.get("assets", {}).values() if a.get("bytes")]
by_type = defaultdict(lambda: [0, 0])
for a in assets:
    t = (a.get("contentType") or a.get("ext") or "other").split(";")[0]
    by_type[t][0] += 1
    by_type[t][1] += a["bytes"]
print(f"  {'type':28} {'count':>6} {'total MB':>10}")
for t, (c, b) in sorted(by_type.items(), key=lambda kv: -kv[1][1]):
    print(f"  {t:28} {c:>6} {b/1048576:>10.2f}")

big = sorted(assets, key=lambda a: -a["bytes"])[:15]
print("\n  Largest single assets:")
for a in big:
    print(f"    {a['bytes']/1024/1024:6.2f} MB  {a['ext']:5} {a['url'][:110]}")

img_bytes = sum(b for t, (c, b) in by_type.items() if t.startswith("image"))
print(f"\n  Total image payload: {img_bytes/1048576:.1f} MB across "
      f"{sum(c for t,(c,b) in by_type.items() if t.startswith('image'))} files")
modern = [a for a in assets if a["ext"] in ("webp", "avif")]
print(f"  WebP/AVIF files: {len(modern)}   (PNG: {sum(1 for a in assets if a['ext']=='png')}, "
      f"JPEG: {sum(1 for a in assets if a['ext'] in ('jpg','jpeg'))})")
out["payload"] = {"byType": {k: v for k, v in by_type.items()}, "largest": big,
                  "imageBytes": img_bytes, "webpAvifCount": len(modern)}

# ---------------------------------------------------------------- 3. rendered DOM
print()
print("=" * 78)
print("3. RENDERED HOMEPAGE DOM")
print("=" * 78)
dom_path = "capture/desktop/home-desktop-rendered.html"
doc = LH.parse(dom_path).getroot() if os.path.exists(dom_path) else None

def txt(e):
    return re.sub(r"\s+", " ", e.text_content() or "").strip()

if doc is not None:
    # header nav
    header = doc.xpath("//header")
    hdr_links = []
    if header:
        for a in header[0].xpath(".//a[@href]"):
            hdr_links.append((txt(a)[:40], a.get("href")))
    print("  HEADER NAV:")
    seen = set()
    for t, h in hdr_links:
        k = (t, h)
        if k in seen or not t:
            continue
        seen.add(k)
        print(f"    {t:35} -> {h[:80]}")

    foot = doc.xpath("//footer")
    foot_links = []
    if foot:
        for a in foot[0].xpath(".//a[@href]"):
            foot_links.append((txt(a)[:45], a.get("href")))
    print(f"\n  FOOTER LINKS ({len(foot_links)}):")
    seen = set()
    for t, h in foot_links:
        k = (t, h)
        if k in seen:
            continue
        seen.add(k)
        print(f"    {t:38} -> {h[:75]}")

    print("\n  HEADING ORDER (h1-h4):")
    for h in doc.xpath("//h1|//h2|//h3|//h4"):
        print(f"    {h.tag.upper():3} {txt(h)[:95]}")

    vids = doc.xpath("//video")
    print(f"\n  VIDEO ELEMENTS: {len(vids)}")
    for v in vids:
        srcs = [s.get("src") for s in v.xpath(".//source[@src]")]
        print(f"    src={v.get('src')} poster={v.get('poster')}")
        print(f"    sources={srcs} autoplay={v.get('autoplay')} loop={v.get('loop')} muted={v.get('muted')} "
              f"playsinline={v.get('playsinline')} preload={v.get('preload')}")

    ifs = doc.xpath("//iframe")
    print(f"\n  IFRAMES: {len(ifs)}")
    for i in ifs:
        print(f"    {i.get('src','')[:100]}")

    forms = doc.xpath("//form")
    print(f"\n  FORMS: {len(forms)}")
    for f in forms:
        inputs = f.xpath(".//input|.//select")
        print(f"    action={f.get('action')} id={f.get('id')} fields={len(inputs)} "
              f"labels={[ (i.get('placeholder') or i.get('name') or '')[:18] for i in inputs][:8]}")

    imgs = doc.xpath("//img")
    lazy = [i for i in imgs if (i.get("loading") or "").lower() == "lazy"]
    noalt = [i for i in imgs if not (i.get("alt") or "").strip()]
    print(f"\n  IMAGES: {len(imgs)}  lazy={len(lazy)}  missing-alt={len(noalt)}")

    scripts = [s.get("src") for s in doc.xpath("//script[@src]")]
    print(f"\n  EXTERNAL SCRIPTS ({len(scripts)}):")
    for s in scripts:
        print(f"    {s[:105]}")

    out["dom"] = {
        "headerLinks": hdr_links, "footerLinks": foot_links,
        "headings": [(h.tag, txt(h)) for h in doc.xpath("//h1|//h2|//h3|//h4")],
        "videos": [v.get("src") for v in vids],
        "iframes": [i.get("src") for i in ifs],
        "imageCount": len(imgs), "lazyImages": len(lazy), "imagesMissingAlt": len(noalt),
        "scripts": scripts, "forms": len(forms),
    }

# ---------------------------------------------------------------- 4. CSS
print()
print("=" * 78)
print("4. DESIGN TOKENS FOUND IN CSS")
print("=" * 78)
css_files = glob.glob("site-code/assets/**/*.css", recursive=True)
fonts = Counter()
colors = Counter()
for cf in css_files:
    try:
        css = open(cf, encoding="utf-8", errors="ignore").read()
    except Exception:
        continue
    for fam in re.findall(r"font-family\s*:\s*([^;{}]+)", css, re.I):
        for f in fam.split(","):
            f = f.strip().strip('"\'').strip()
            if f and not f.startswith("var(") and len(f) < 40:
                fonts[f] += 1
    for c in re.findall(r"#([0-9a-fA-F]{6})\b", css):
        colors["#" + c.lower()] += 1

print(f"  CSS files scanned: {len(css_files)}")
print("\n  Font families (by declaration count):")
for f, c in fonts.most_common(15):
    print(f"    {c:>5}  {f}")
print("\n  Hex colours (by frequency):")
for c, n in colors.most_common(20):
    print(f"    {n:>5}  {c}")
out["design"] = {"fonts": fonts.most_common(15), "colors": colors.most_common(20),
                 "cssFiles": len(css_files)}

with open("audit-data.json", "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, default=str)
print("\nWrote audit-data.json")
