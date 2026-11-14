#!/usr/bin/env python3
"""Builds the exercise-instruction PDFs in pdf/ from the text files in pdf-src/.

Usage:  python3 pdf-src/build.py            (all files)
        python3 pdf-src/build.py <name>     (one file, name without .txt)

Source format: a few "key: value" lines, a blank line, then the text.
"## Title" starts a section, "### Name | time" a block heading, "— Pauze ... —" is a rest row, "> text" is a note,
every other line is one exercise. A (https://...) link at the end of a line
becomes a clickable "video" link. The coach's wording is never changed.
"""
import html, re, subprocess, sys, shutil, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "pdf-src"
OUT = ROOT / "pdf"
# snap chromium cannot read /tmp, so stage under ~/.cache
STAGE = Path.home() / ".cache" / "tk-pdfgen"

CSS = """
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'DejaVu Sans', sans-serif; color: #15171a; font-size: 10.5pt; line-height: 1.45; margin: 0; }
header { border-bottom: 3px solid #a3e635; padding-bottom: 10px; margin-bottom: 14px; }
.brand { font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #566073; }
.chip { display: inline-block; background: #a3e635; color: #15171a; font-weight: 700; font-size: 9pt; padding: 2px 10px; border-radius: 999px; margin: 8px 0 6px; }
h1 { font-size: 20pt; line-height: 1.15; margin: 0 0 4px; }
.body-part { color: #566073; font-size: 10pt; }
.duration { margin-top: 6px; font-weight: 700; font-size: 11pt; }
h2 { font-size: 13pt; margin: 18px 0 6px; padding: 4px 10px; background: #f4fbe0; border-left: 4px solid #557a0a; break-after: avoid; }
h3 { display: flex; justify-content: space-between; font-size: 10.5pt; margin: 10px 0 2px; color: #557a0a; break-after: avoid; }
h3 .t { color: #566073; font-weight: 600; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 4px 0 4px 22px; position: relative; border-bottom: 1px solid #eef0f4; break-inside: avoid; }
li::before { content: ''; position: absolute; left: 3px; top: 10px; width: 8px; height: 8px; border: 1.5px solid #557a0a; border-radius: 2px; }
li.rest { color: #566073; font-style: italic; text-align: center; background: #f6f7f9; border-bottom: none; margin: 2px 0; }
li.rest::before { display: none; }
.note { margin-top: 10px; padding: 8px 12px; background: #fff7d6; border-radius: 6px; font-weight: 600; }
a { color: #9e1724; text-decoration: none; font-weight: 600; }
"""

def line_html(text):
    m = re.search(r"\s*\((https?://[^)\s]+)\)\s*$", text)
    link = ""
    if m:
        link = f' <a href="{html.escape(m.group(1))}">▶ video</a>'
        text = text[: m.start()]
    return html.escape(text) + link

def build(txt):
    meta, body, in_body = {}, [], False
    for raw in txt.read_text(encoding="utf-8").splitlines():
        if not in_body:
            if not raw.strip():
                in_body = True
            else:
                k, v = raw.split(":", 1)
                meta[k.strip()] = v.strip()
        else:
            body.append(raw.rstrip())
    parts, open_list = [], False
    def close():
        nonlocal open_list
        if open_list:
            parts.append("</ul>"); open_list = False
    for ln in body:
        if not ln.strip():
            continue
        if ln.startswith("## "):
            close(); parts.append(f"<h2>{html.escape(ln[3:])}</h2>")
        elif ln.startswith("### "):
            close()
            name, _, t = ln[4:].partition(" | ")
            parts.append(f'<h3><span>{html.escape(name)}</span><span class="t">{html.escape(t)}</span></h3>')
        elif ln.startswith("> "):
            close(); parts.append(f'<div class="note">{html.escape(ln[2:])}</div>')
        else:
            if not open_list:
                parts.append("<ul>"); open_list = True
            cls = ' class="rest"' if ln.startswith("— Pauze") else ""
            parts.append(f"<li{cls}>{line_html(ln)}</li>")
    close()
    doc = f"""<!doctype html><html lang="lv"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<header><div class="brand">Toma Komasa sportistu portāls</div>
<div class="chip">{html.escape(meta['grupa'])}</div>
<h1>{html.escape(meta['nosaukums'])}</h1>
<div class="body-part">{html.escape(meta['kermena_dala'])}</div>
{('<div class="duration">Ilgums: ' + html.escape(meta['ilgums']) + '</div>') if meta.get('ilgums') else ''}</header>
{''.join(parts)}
</body></html>"""
    STAGE.mkdir(parents=True, exist_ok=True)
    page = STAGE / (meta["fails"] + ".html")
    page.write_text(doc, encoding="utf-8")
    pdf = STAGE / (meta["fails"] + ".pdf")
    subprocess.run(["chromium", "--headless", "--no-sandbox", "--disable-gpu",
                    "--no-pdf-header-footer", f"--print-to-pdf={pdf}", page.as_uri()],
                   check=True, capture_output=True)
    OUT.mkdir(exist_ok=True)
    shutil.copy(pdf, OUT / pdf.name)
    print("OK", OUT / pdf.name)

if __name__ == "__main__":
    names = sys.argv[1:] or [p.stem for p in sorted(SRC.glob("*.txt"))]
    for n in names:
        build(SRC / f"{n}.txt")
    shutil.rmtree(STAGE, ignore_errors=True)
