#!/usr/bin/env python3
"""Builds the exercise-instruction PDFs in pdf/ from the text files in pdf-src/.

Usage:  python3 pdf-src/build.py            (all files)
        python3 pdf-src/build.py <name>     (one file, name without .txt)

Source format: a few "key: value" lines, a blank line, then the text.
"## Title | time" starts a section (the time is optional), "### Name" starts a kept-together block, "~" is a gap between parts of a block, "— Pauze ... —" is a rest row, "> text" is a note,
every other line is one exercise. A (https://...) link anywhere in a line, or (label - https://...),
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
.chip { display: inline-block; background: #a3e635; color: #15171a; font-weight: 700; font-size: 9pt; padding: 2px 10px; border-radius: 999px; margin: 8px 0 6px; }
h1 { font-size: 20pt; line-height: 1.15; margin: 0 0 4px; }
.duration { margin-top: 6px; font-weight: 700; font-size: 11pt; }
h2 { display: flex; justify-content: space-between; align-items: baseline; font-size: 13pt; margin: 18px 0 6px; padding: 4px 10px; background: #f4fbe0; border-left: 4px solid #557a0a; break-after: avoid; }
h3 { font-size: 11pt; margin: 14px 0 4px; color: #557a0a; break-after: avoid; }
.block { break-inside: avoid; }
.gap { height: 8px; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 4px 0 4px 22px; position: relative; border-bottom: 1px solid #eef0f4; break-inside: avoid; }
li::before { content: ''; position: absolute; left: 4px; top: 11px; width: 7px; height: 7px; background: #3d5a07; transform: rotate(45deg); }
li.rest { color: #566073; font-style: italic; text-align: center; background: #f6f7f9; border-bottom: none; margin: 2px 0; }
li.rest::before { display: none; }
.note { margin-top: 10px; padding: 8px 12px; background: #fff7d6; border-radius: 6px; font-weight: 600; }
h2 .t { font-size: 10.5pt; font-weight: 600; color: #566073; }
a { color: #9e1724; text-decoration: none; font-weight: 600; }
"""

LINK_RE = re.compile(r"\s*\((?:([^()]*?)\s*-\s*)?(https?://[^)\s]+)\)")

def line_html(text):
    """Escapes a line and turns every "(https://...)" - optionally "(label - https://...)" -
    into a clickable "video" link, in the place it was written."""
    out, pos = [], 0
    for m in LINK_RE.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        label = f" ({html.escape(m.group(1))})" if m.group(1) else ""
        out.append(f' <a href="{html.escape(m.group(2))}">▶ video</a>{label}')
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return "".join(out).strip()

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
    parts, open_list, in_block = [], False, False
    def close():
        nonlocal open_list
        if open_list:
            parts.append("</ul>"); open_list = False
    for ln in body:
        if not ln.strip():
            continue
        if ln.startswith("## "):
            close()
            if in_block:
                parts.append("</div>"); in_block = False
            name, _, t = ln[3:].partition(" | ")
            name = name.rstrip(": ")  # headings read the same with or without the coach's colon
            parts.append(f'<h2><span>{html.escape(name)}</span><span class="t">{html.escape(t)}</span></h2>')
        elif ln.startswith("### "):
            close()
            if in_block:
                parts.append("</div>")
            parts.append(f'<div class="block"><h3>{html.escape(ln[4:])}</h3>')
            in_block = True
        elif ln.strip() == "~":
            close()
            parts.append('<div class="gap"></div>')
        elif ln.startswith("> "):
            close(); parts.append(f'<div class="note">{html.escape(ln[2:])}</div>')
        else:
            if not open_list:
                parts.append("<ul>"); open_list = True
            cls = ' class="rest"' if ln.startswith("— Pauze") else ""
            parts.append(f"<li{cls}>{line_html(ln[:1].upper() + ln[1:])}</li>")
    close()
    if in_block:
        parts.append("</div>")
    doc = f"""<!doctype html><html lang="lv"><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<header><div class="chip">{html.escape(meta['grupa'])}</div>
<h1>{html.escape(meta['nosaukums'])}</h1>
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
