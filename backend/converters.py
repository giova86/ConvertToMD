import hashlib
import io

MIN_IMAGE_EMU = 32 * 9525  # ignore decorative images smaller than ~32px


class _ImageStore:
    """Collects embedded images into a name -> bytes dict, de-duplicating by content."""

    def __init__(self, target: dict):
        self.target = target
        self._by_hash: dict[str, str] = {}

    def add(self, blob: bytes, ext: str) -> str:
        digest = hashlib.sha1(blob).hexdigest()
        if digest in self._by_hash:
            return self._by_hash[digest]
        name = f"image_{len(self.target) + 1}.{ext.lstrip('.').lower() or 'png'}"
        self.target[name] = blob
        self._by_hash[digest] = name
        return name


def _paragraph_images(para, doc, store: _ImageStore) -> list[str]:
    """Return Markdown image references for pictures embedded in a paragraph."""
    refs = []
    for drawing in para._p.xpath(".//w:drawing"):
        extent = drawing.xpath(".//wp:extent")
        if extent and (
            int(extent[0].get("cx", 0)) < MIN_IMAGE_EMU
            or int(extent[0].get("cy", 0)) < MIN_IMAGE_EMU
        ):
            continue
        doc_pr = drawing.xpath(".//wp:docPr")
        alt = (doc_pr[0].get("descr") or "").replace("\n", " ").strip() if doc_pr else ""
        for blip in drawing.xpath(".//a:blip"):
            rid = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
            part = doc.part.related_parts.get(rid) if rid else None
            if part is None:
                continue
            name = store.add(part.blob, part.partname.ext)
            refs.append(f"![{alt}](images/{name})")
    return refs



def _runs_to_md(runs) -> str:
    md = ""
    for run in runs:
        t = run.text
        if not t:
            continue
        if run.bold and run.italic:
            t = f"***{t}***"
        elif run.bold:
            t = f"**{t}**"
        elif run.italic:
            t = f"*{t}*"
        md += t
    return md


def _table_to_md(table) -> str:
    rows = table.rows
    if not rows:
        return ""
    header_cells = [c.text.strip().replace("\n", " ").replace("|", "\\|") for c in rows[0].cells]
    header = "| " + " | ".join(header_cells) + " |"
    sep = "| " + " | ".join("---" for _ in header_cells) + " |"
    data_rows = []
    for row in rows[1:]:
        cells = [c.text.strip().replace("\n", " ").replace("|", "\\|") for c in row.cells]
        data_rows.append("| " + " | ".join(cells) + " |")
    return "\n".join([header, sep] + data_rows)


HEADING_STYLES = {
    "Heading 1": "#", "Heading 2": "##", "Heading 3": "###",
    "Heading 4": "####", "Heading 5": "#####", "Heading 6": "######",
    "Title": "#", "Subtitle": "##",
}


def docx_to_markdown(content: bytes, images: dict | None = None) -> tuple[str, dict]:
    """Convert DOCX to Markdown. If `images` is a dict, embedded pictures are
    extracted into it (name -> bytes) and referenced as images/<name>."""
    from docx import Document

    doc = Document(io.BytesIO(content))
    parts = []
    info = {"type": "word", "paragraphs": 0, "headings": 0, "tables": 0, "images": 0}
    store = _ImageStore(images) if images is not None else None

    para_idx = 0
    table_idx = 0

    for child in doc.element.body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            if para_idx < len(doc.paragraphs):
                para = doc.paragraphs[para_idx]
                para_idx += 1
                text = para.text.strip()
                if store is not None:
                    refs = _paragraph_images(para, doc, store)
                    if refs:
                        info["images"] += len(refs)
                        if not text:
                            parts.append("\n\n".join(refs))
                            continue
                if not text:
                    continue
                style_name = para.style.name if para.style else ""
                if style_name in HEADING_STYLES:
                    parts.append(f"{HEADING_STYLES[style_name]} {text}")
                    info["headings"] += 1
                else:
                    md_text = _runs_to_md(para.runs)
                    if md_text.strip():
                        parts.append(md_text)
                        info["paragraphs"] += 1
                if store is not None and refs:
                    parts.append("\n\n".join(refs))

        elif tag == "tbl":
            if table_idx < len(doc.tables):
                tbl = doc.tables[table_idx]
                table_idx += 1
                md_table = _table_to_md(tbl)
                if md_table:
                    parts.append(md_table)
                    info["tables"] += 1

    return "\n\n".join(parts), info


def xlsx_to_markdown(content: bytes) -> tuple[str, dict]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    parts = []
    info = {"type": "excel", "sheets": []}

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        non_empty = [r for r in rows if any(c is not None for c in r)]

        sheet_info = {
            "name": sheet_name,
            "rows": len(non_empty),
            "cols": len(non_empty[0]) if non_empty else 0,
        }
        info["sheets"].append(sheet_info)

        if not non_empty:
            continue

        parts.append(f"## Sheet: {sheet_name}")

        header = non_empty[0]
        parts.append("| " + " | ".join((str(c) if c is not None else "").replace("\n", " ").replace("|", "\\|") for c in header) + " |")
        parts.append("| " + " | ".join("---" for _ in header) + " |")

        for row in non_empty[1:]:
            parts.append("| " + " | ".join((str(c) if c is not None else "").replace("\n", " ").replace("|", "\\|") for c in row) + " |")

    return "\n\n".join(parts), info


def convert_to_pdf_bytes(content: bytes, filename: str) -> bytes:
    import subprocess
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(content)

        try:
            result = subprocess.run(
                ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, input_path],
                capture_output=True,
                timeout=120,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("LibreOffice timed out after 120 seconds")

        if result.returncode != 0:
            raise RuntimeError(
                f"LibreOffice conversion failed: {result.stderr.decode(errors='replace')}"
            )

        base = os.path.splitext(filename)[0]
        pdf_path = os.path.join(tmpdir, base + ".pdf")
        if not os.path.exists(pdf_path):
            raise RuntimeError("LibreOffice did not produce a PDF file")

        with open(pdf_path, "rb") as f:
            return f.read()


def extract_pdf_page_images(page, seen_xrefs: set, dpi: int = 200, min_side_pt: float = 40.0) -> list[dict]:
    """Render each meaningful embedded image of a PDF page as a PNG crop.

    Skips tiny decorative images, images already seen on earlier pages (logos)
    and page-sized images (scans, which OCR already covers). Returns dicts
    sorted top-to-bottom: {"xref", "bbox", "png": bytes}.
    """
    import fitz

    page_rect = page.rect
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    found = []
    # Image blocks of the text dict carry the *visible* bbox (after the clip applied
    # by e.g. Word's picture cropping); get_image_info() returns the uncropped one.
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 1:
            continue
        rect = fitz.Rect(block["bbox"]) & page_rect
        # xref is not always reported; pixel size identifies repeated images well enough
        key = block.get("xref") or (block["width"], block["height"], len(block["image"]))
        if rect.is_empty or key in seen_xrefs:
            continue
        if rect.width < min_side_pt or rect.height < min_side_pt:
            continue
        if rect.get_area() >= 0.85 * page_rect.get_area():
            continue
        seen_xrefs.add(key)
        pix = page.get_pixmap(matrix=mat, clip=rect)
        found.append({"xref": key, "bbox": tuple(rect), "png": pix.tobytes("png")})

    raster_rects = [fitz.Rect(f["bbox"]) for f in found]
    for rect in _vector_figure_rects(page, min_side_pt):
        if any(abs(rect & r) > 0.5 * abs(rect) for r in raster_rects):
            continue  # already captured as a raster image
        pix = page.get_pixmap(matrix=mat, clip=rect)
        found.append({"xref": None, "bbox": tuple(rect), "png": pix.tobytes("png")})
    found.sort(key=lambda i: (i["bbox"][1], i["bbox"][0]))
    text_blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    for fig in found:
        fig.update(_figure_anchors(fitz.Rect(fig["bbox"]), text_blocks))
    return found


def _vector_figure_rects(page, min_side_pt: float, min_paths: int = 10, pad: float = 4.0) -> list:
    """Find vector-drawn figures (plots, diagrams) as clusters of drawing paths.

    Clusters that are tiny, have few paths, or consist only of straight
    horizontal/vertical strokes (table borders, rules) are ignored.
    """
    import fitz

    page_rect = page.rect
    drawings = page.get_drawings()
    if len(drawings) < min_paths:
        return []

    def visible(d) -> bool:
        # Near-white fills without a stroke (gradient fades, background boxes)
        # can't be seen on white paper but would stretch the bounding box.
        return d.get("color") is not None or d.get("fill") is None or min(d["fill"]) < 0.95

    text_lines = [
        fitz.Rect(line["bbox"])
        for block in page.get_text("dict")["blocks"] if block["type"] == 0
        for line in block["lines"]
    ]
    rects = []
    for cluster in page.cluster_drawings(drawings=drawings, x_tolerance=20, y_tolerance=20):
        members = [d for d in drawings if fitz.Rect(d["rect"]).intersects(cluster)]
        if len(members) < min_paths:
            continue
        if all(min(d["rect"].width, d["rect"].height) < 1.5 for d in members):
            continue  # only rules / table borders
        shown = [d for d in members if visible(d)]
        if not shown:
            continue
        rect = fitz.Rect(shown[0]["rect"])
        for d in shown[1:]:
            rect |= d["rect"]
        rect = _pad_clear_of_text(rect, text_lines, pad) & page_rect
        if rect.width < min_side_pt or rect.height < min_side_pt:
            continue
        if rect.get_area() >= 0.85 * page_rect.get_area():
            continue  # page background / frame
        rects.append(rect)
    return rects


def _pad_clear_of_text(rect, text_lines, pad: float):
    """Grow `rect` by `pad` on each side, but never into a neighbouring text line
    (caption, running header) that lies outside it."""
    import fitz

    x0, y0, x1, y1 = rect
    px0 = px1 = py0 = py1 = pad
    for line in text_lines:
        if line.intersects(rect):
            continue  # text inside the figure (axis labels): keep
        if line.x0 < x1 and line.x1 > x0:  # horizontally overlapping -> above/below
            if line.y1 <= y0:
                py0 = min(py0, max(0.0, y0 - line.y1 - 0.5))
            elif line.y0 >= y1:
                py1 = min(py1, max(0.0, line.y0 - y1 - 0.5))
        if line.y0 < y1 and line.y1 > y0:  # vertically overlapping -> left/right
            if line.x1 <= x0:
                px0 = min(px0, max(0.0, x0 - line.x1 - 0.5))
            elif line.x0 >= x1:
                px1 = min(px1, max(0.0, line.x0 - x1 - 0.5))
    return fitz.Rect(x0 - px0, y0 - py0, x1 + px1, y1 + py1)


def _figure_anchors(rect, text_blocks, max_words: int = 8, max_gap_pt: float = 50.0) -> dict:
    """Text just below / above a figure, used to place it in the OCR output.

    `after` is the start of the nearest text block under the figure (usually its
    caption), `before` the end of the nearest block above it. Blocks lying inside
    the figure (axis labels, ...) are ignored; only blocks that overlap it
    horizontally count, so side-by-side columns don't get mixed up.
    """
    below, above = None, None
    at_start = not any(b[3] <= rect.y0 + 1 for b in text_blocks)
    for x0, y0, x1, y1, text, *_ in text_blocks:
        if x1 <= rect.x0 or x0 >= rect.x1:
            continue
        if (y0 + y1) / 2 > rect.y0 and (y0 + y1) / 2 < rect.y1:
            continue
        if y0 >= rect.y1 - 1 and (below is None or y0 < below[0]):
            below = (y0, text)
        elif y1 <= rect.y0 + 1 and (above is None or y1 > above[0]):
            above = (y1, text)
    # A neighbour much further away than the gap is probably separated from the
    # figure by something that isn't text (a title drawn as an image, ...).
    if below and below[0] - rect.y1 > max_gap_pt:
        below = None
    if above and rect.y0 - above[0] > max_gap_pt:
        above = None
    return {
        "after": " ".join(below[1].split()[:max_words]) if below else "",
        "before": " ".join(above[1].split()[-max_words:]) if above else "",
        "at_start": at_start,
    }
