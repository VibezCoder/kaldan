"""Builds the media inventory workbook: one sheet for photographs, one for videos."""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

m = json.load(open("media/manifest.json", encoding="utf-8"))

HDR_FILL = PatternFill("solid", fgColor="1E3B3D")
HDR_FONT = Font(color="FFFFFF", bold=True, size=11)
ALT_FILL = PatternFill("solid", fgColor="F5F2EC")
THIN = Side(style="thin", color="D9D2C5")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

wb = Workbook()

# ---------------------------------------------------------------- images
ws = wb.active
ws.title = "Photographs"
cols = [
    ("#", 6), ("File", 46), ("Category", 18), ("Kind", 8), ("Description (site alt text)", 70),
    ("Width", 8), ("Height", 8), ("Aspect", 8), ("KB", 8), ("Source pages", 22), ("Asset URL", 60),
]
ws.append([c[0] for c in cols])
for i, (name, width) in enumerate(cols, start=1):
    ws.cell(row=1, column=i).fill = HDR_FILL
    ws.cell(row=1, column=i).font = HDR_FONT
    ws.cell(row=1, column=i).alignment = Alignment(vertical="center")
    ws.column_dimensions[get_column_letter(i)].width = width
ws.row_dimensions[1].height = 22
ws.freeze_panes = "A2"

photos = [r for r in m["images"] if r.get("kind") == "photo"]
photos.sort(key=lambda r: (r["category"], -(r.get("width", 0) * r.get("height", 0))))

row = 2
for n, r in enumerate(photos, start=1):
    ratio = round(r["width"] / r["height"], 2) if r.get("height") else ""
    ws.append([
        n, r["file"], r["category"], r.get("kind", ""), r.get("altClean") or r.get("alt", ""),
        r.get("width"), r.get("height"), ratio, round(r.get("bytes", 0) / 1024),
        ", ".join(r.get("sourcePages", [])), r.get("servedUrl", ""),
    ])
    for c in range(1, len(cols) + 1):
        cell = ws.cell(row=row, column=c)
        cell.border = BORDER
        cell.alignment = Alignment(vertical="top", wrap_text=c == 5)
        if n % 2 == 0:
            cell.fill = ALT_FILL
    ws.cell(row=row, column=11).font = Font(color="1155CC", size=9)
    row += 1

ws.auto_filter.ref = f"A1:K{row-1}"

# ---------------------------------------------------------------- videos
vs = wb.create_sheet("Videos")
vcols = [("#", 6), ("File", 52), ("MB", 10), ("Purpose", 34), ("Source URL", 88)]
vs.append([c[0] for c in vcols])
for i, (name, width) in enumerate(vcols, start=1):
    vs.cell(row=1, column=i).fill = HDR_FILL
    vs.cell(row=1, column=i).font = HDR_FONT
    vs.column_dimensions[get_column_letter(i)].width = width
vs.row_dimensions[1].height = 22
vs.freeze_panes = "A2"

PURPOSE = {
    "kaldan_palace_overview_compressed_1a13rr.mp4": "Hero / estate overview (current homepage film)",
    "kaldan_home_page_video_1087_x_590_2.mp4": "Alternate hero film",
    "panch_mahal_images_21.mp4": "Panch Mahal chapter",
    "sagar_bar_13.mp4": "Dining — Sagar Bar",
    "kaldan_dhani_video_website_425x271.mp4": "Dining — Dhani all-day dining",
    "kaldan_somapuraa_video_website_425x271.mp4": "Dining — Somapuraa bar",
    "kaldan_chill_with_grills_video_website_425x271.mp4": "Dining — Chill with Grills",
    "1_year_wedding_video_1.mp4": "Celebrations — wedding film",
    "kaldan_samudhra_the_gi_wedding_27th_may_1_1_1s9fasd93js.mp4": "Celebrations — wedding film",
    "kaldan_samudhra_weddings_may_28_2025_1_1.mp4": "Celebrations — wedding film",
    "kaldan_samudhra_weddings_under_60mb.mp4": "Celebrations — wedding film",
}
row = 2
for n, v in enumerate(m["videos"], start=1):
    name = os.path.basename(v["file"])
    vs.append([n, name, round(v.get("bytes", 0) / 1048576, 1), PURPOSE.get(name, ""), v["url"]])
    for c in range(1, 6):
        cell = vs.cell(row=row, column=c)
        cell.border = BORDER
        cell.alignment = Alignment(vertical="top", wrap_text=c == 5)
        if n % 2 == 0:
            cell.fill = ALT_FILL
    row += 1

# ---------------------------------------------------------------- summary
ss = wb.create_sheet("Summary")
ss.column_dimensions["A"].width = 30
ss.column_dimensions["B"].width = 46
ss["A1"] = "Kaldan Samudhra — Media Inventory"
ss["A1"].font = Font(bold=True, size=15, color="1E3B3D")
ss["A2"] = f"Generated {m['generatedAt'][:10]} from {m['source']}"
ss["A2"].font = Font(italic=True, size=9, color="777777")

s = m["summary"]
rows = [
    ("Photographs (usable, >=900px)", s.get("photos")),
    ("Icons / small activity tiles", s.get("icons")),
    ("Photograph payload", f"{s.get('photoBytes', 0)/1048576:.1f} MB"),
    ("Videos", s.get("videos")),
    ("Video payload", f"{s.get('videoBytes', 0)/1048576:.1f} MB"),
]
r = 4
for k, val in rows:
    ss.cell(row=r, column=1, value=k).font = Font(bold=True)
    ss.cell(row=r, column=2, value=val)
    r += 1

r += 1
ss.cell(row=r, column=1, value="Photographs by category").font = Font(bold=True, size=12)
r += 1
ss.cell(row=r, column=1, value="Category").fill = HDR_FILL
ss.cell(row=r, column=1).font = HDR_FONT
ss.cell(row=r, column=2, value="Count").fill = HDR_FILL
ss.cell(row=r, column=2).font = HDR_FONT
r += 1
for cat, d in sorted(s.get("byCategory", {}).items()):
    ss.cell(row=r, column=1, value=cat)
    ss.cell(row=r, column=2, value=d["photos"])
    r += 1

ss.cell(row=r + 2, column=1, value="Notes").font = Font(bold=True, size=12)
notes = [
    "Images were re-requested from the Kaldan CDN at 2400px wide, full frame, as WebP.",
    "Descriptions are the site's own alt text, with the repeated brand suffix removed.",
    "Category comes from the alt text plus the page each photo appears on.",
    "A handful of activity photographs are filed by page rather than subject; see the Kind column.",
    "Videos are the original files. They are unoptimised and need re-encoding before production.",
]
for i, n in enumerate(notes):
    ss.cell(row=r + 3 + i, column=1, value="• " + n).alignment = Alignment(wrap_text=False)

out = "media/kaldan-media-inventory.xlsx"
wb.save(out)
print(f"wrote {out}")
print(f"  photographs: {len(photos)}")
print(f"  videos: {len(m['videos'])}")