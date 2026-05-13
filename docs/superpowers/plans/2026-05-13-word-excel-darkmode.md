# Word/Excel Support + Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Word (.docx/.doc) and Excel (.xlsx/.xls) file conversion with direct-extraction and OCR modes, plus a dark mode toggle covering the UI and markdown panel but not the document viewer.

**Architecture:** Backend gains `/api/convert-direct` (python-docx/openpyxl text extraction) and `/api/convert-to-pdf` (LibreOffice → PyMuPDF pipeline reuse). Frontend adds file-type detection, a conversion mode selector, a `DirectView` component for direct mode, and a `ThemeContext` for dark mode with localStorage persistence. Dark mode uses Tailwind's `class` strategy; the document viewer pane stays white in all modes.

**Tech Stack:** FastAPI + python-docx + openpyxl (backend); React 18 + Tailwind darkMode:class + lucide-react Sun/Moon icons (frontend); pytest (backend tests).

---

## File Map

**Backend — modify:**
- `backend/requirements.txt` — add python-docx, openpyxl, pandas, pytest

**Backend — create:**
- `backend/converters.py` — `docx_to_markdown()`, `xlsx_to_markdown()`, `convert_to_pdf_bytes()`
- `backend/test_main.py` — pytest tests for all new endpoints

**Backend — modify:**
- `backend/main.py` — add `/api/convert-direct` and `/api/convert-to-pdf` endpoints

**Frontend — modify:**
- `frontend/tailwind.config.js` — `darkMode: 'class'`
- `frontend/index.html` — inline script to apply dark class before React renders
- `frontend/src/index.css` — dark body background + dark scrollbar
- `frontend/src/main.jsx` — wrap app in `<ThemeProvider>`
- `frontend/src/api.js` — add `convertDirect()`, `convertToPdf()`
- `frontend/src/App.jsx` — file-type routing, mode-select state, dark Header toggle
- `frontend/src/components/UploadZone.jsx` — accept Word/Excel, update label text
- `frontend/src/components/SplitView.jsx` — dark variants on toolbar and right panel
- `frontend/src/components/MarkdownPanel.jsx` — dark variants on all states

**Frontend — create:**
- `frontend/src/ThemeContext.jsx` — theme context + localStorage
- `frontend/src/components/DocInfoPanel.jsx` — structural info for direct mode (always light)
- `frontend/src/components/DirectView.jsx` — split view for direct mode (DocInfoPanel + MarkdownPanel)
- `frontend/src/components/ConversionModeSelect.jsx` — mode selector shown after Word/Excel upload

---

## Task 1: Backend dependencies + test infrastructure

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/test_main.py`

- [ ] **Step 1.1: Add dependencies to requirements.txt**

Replace the contents of `backend/requirements.txt` with:
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-multipart>=0.0.9
PyMuPDF>=1.23.0
httpx>=0.26.0
pydantic>=2.5.0
python-docx>=1.1.0
openpyxl>=3.1.0
pandas>=2.2.0
pytest>=8.0.0
```

- [ ] **Step 1.2: Install new dependencies**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk
source backend/venv/bin/activate 2>/dev/null || python3 -m venv backend/venv && source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 1.3: Create test file with fixture helpers**

Create `backend/test_main.py`:
```python
import io
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def make_docx_bytes() -> bytes:
    from docx import Document
    doc = Document()
    doc.add_heading("Test Title", level=1)
    doc.add_paragraph("Hello world paragraph.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.rows[0].cells[0].text = "Col A"
    tbl.rows[0].cells[1].text = "Col B"
    tbl.rows[1].cells[0].text = "Val 1"
    tbl.rows[1].cells[1].text = "Val 2"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_xlsx_bytes() -> bytes:
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append(["Name", "Amount"])
    ws.append(["Alice", 100])
    ws.append(["Bob", 200])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 1.4: Run the health test**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_health -v
```

Expected: `PASSED`

- [ ] **Step 1.5: Commit**

```bash
git add backend/requirements.txt backend/test_main.py
git commit -m "chore: add python-docx, openpyxl, pandas, pytest dependencies"
```

---

## Task 2: Backend — converters module + Word direct extraction

**Files:**
- Create: `backend/converters.py`
- Modify: `backend/test_main.py`

- [ ] **Step 2.1: Write the failing test for Word direct extraction**

Add to `backend/test_main.py`:
```python
def test_convert_direct_docx():
    docx_bytes = make_docx_bytes()
    r = client.post(
        "/api/convert-direct",
        files={"file": ("document.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 200
    data = r.json()
    assert "markdown" in data
    assert "info" in data
    assert data["filename"] == "document.docx"
    assert "# Test Title" in data["markdown"]
    assert "Hello world paragraph" in data["markdown"]
    assert "Col A" in data["markdown"]
    assert data["info"]["type"] == "word"
    assert data["info"]["headings"] >= 1
    assert data["info"]["tables"] >= 1
```

- [ ] **Step 2.2: Run to confirm it fails**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_convert_direct_docx -v
```

Expected: `FAILED` — `404 Not Found` (endpoint doesn't exist yet)

- [ ] **Step 2.3: Create converters.py with Word extraction**

Create `backend/converters.py`:
```python
import io
import subprocess
import tempfile
import os


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
    header_cells = [c.text.strip().replace("\n", " ") for c in rows[0].cells]
    header = "| " + " | ".join(header_cells) + " |"
    sep = "| " + " | ".join("---" for _ in header_cells) + " |"
    data_rows = []
    for row in rows[1:]:
        cells = [c.text.strip().replace("\n", " ") for c in row.cells]
        data_rows.append("| " + " | ".join(cells) + " |")
    return "\n".join([header, sep] + data_rows)


HEADING_STYLES = {
    "Heading 1": "#", "Heading 2": "##", "Heading 3": "###",
    "Heading 4": "####", "Heading 5": "#####", "Heading 6": "######",
    "Title": "#", "Subtitle": "##",
}


def docx_to_markdown(content: bytes) -> tuple[str, dict]:
    from docx import Document

    doc = Document(io.BytesIO(content))
    parts = []
    info = {"type": "word", "paragraphs": 0, "headings": 0, "tables": 0}

    para_idx = 0
    table_idx = 0

    for child in doc.element.body:
        tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag

        if tag == "p":
            if para_idx < len(doc.paragraphs):
                para = doc.paragraphs[para_idx]
                para_idx += 1
                text = para.text.strip()
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

        elif tag == "tbl":
            if table_idx < len(doc.tables):
                tbl = doc.tables[table_idx]
                table_idx += 1
                md_table = _table_to_md(tbl)
                if md_table:
                    parts.append(md_table)
                    info["tables"] += 1

    return "\n\n".join(parts), info
```

- [ ] **Step 2.4: Add the `/api/convert-direct` endpoint (Word path only) to main.py**

Add these imports at the top of `backend/main.py` (after existing imports):
```python
from converters import docx_to_markdown, xlsx_to_markdown, convert_to_pdf_bytes
```

Add this endpoint after the existing `/api/upload` endpoint:
```python
SUPPORTED_DIRECT = {".docx", ".xlsx", ".xls"}
SUPPORTED_OCR = {".docx", ".doc", ".xlsx", ".xls"}


@app.post("/api/convert-direct")
async def convert_direct(file: UploadFile = File(...)):
    name = file.filename.lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""

    if ext not in SUPPORTED_DIRECT:
        raise HTTPException(
            status_code=400,
            detail=f"Direct extraction only supports .docx, .xlsx, .xls — got {ext}",
        )

    content = await file.read()

    try:
        if ext == ".docx":
            markdown, info = docx_to_markdown(content)
        else:
            markdown, info = xlsx_to_markdown(content)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Conversion failed: {e}")

    return {"filename": file.filename, "markdown": markdown, "info": info}
```

Note: `xlsx_to_markdown` and `convert_to_pdf_bytes` will be added to converters.py in the next tasks — the import will fail until then. Add them as stubs for now at the bottom of `converters.py`:

```python
def xlsx_to_markdown(content: bytes) -> tuple[str, dict]:
    raise NotImplementedError


def convert_to_pdf_bytes(content: bytes, filename: str) -> bytes:
    raise NotImplementedError
```

- [ ] **Step 2.5: Run the Word test**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_convert_direct_docx -v
```

Expected: `PASSED`

- [ ] **Step 2.6: Commit**

```bash
git add backend/converters.py backend/main.py backend/test_main.py
git commit -m "feat(backend): add Word .docx direct extraction via python-docx"
```

---

## Task 3: Backend — Excel direct extraction

**Files:**
- Modify: `backend/converters.py`
- Modify: `backend/test_main.py`

- [ ] **Step 3.1: Write the failing test for Excel**

Add to `backend/test_main.py`:
```python
def test_convert_direct_xlsx():
    xlsx_bytes = make_xlsx_bytes()
    r = client.post(
        "/api/convert-direct",
        files={"file": ("data.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["filename"] == "data.xlsx"
    assert "## Sheet: Sales" in data["markdown"]
    assert "Name" in data["markdown"]
    assert "Alice" in data["markdown"]
    assert data["info"]["type"] == "excel"
    assert len(data["info"]["sheets"]) == 1
    assert data["info"]["sheets"][0]["name"] == "Sales"
    assert data["info"]["sheets"][0]["rows"] == 3
```

- [ ] **Step 3.2: Run to confirm it fails**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_convert_direct_xlsx -v
```

Expected: `FAILED` — `NotImplementedError`

- [ ] **Step 3.3: Implement xlsx_to_markdown in converters.py**

Replace the `xlsx_to_markdown` stub in `backend/converters.py` with:
```python
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
        parts.append("| " + " | ".join(str(c) if c is not None else "" for c in header) + " |")
        parts.append("| " + " | ".join("---" for _ in header) + " |")

        for row in non_empty[1:]:
            parts.append("| " + " | ".join(str(c) if c is not None else "" for c in row) + " |")

    return "\n\n".join(parts), info
```

- [ ] **Step 3.4: Run the Excel test**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_convert_direct_xlsx -v
```

Expected: `PASSED`

- [ ] **Step 3.5: Run all tests so far**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py -v
```

Expected: all 3 tests `PASSED`

- [ ] **Step 3.6: Commit**

```bash
git add backend/converters.py backend/test_main.py
git commit -m "feat(backend): add Excel .xlsx/.xls direct extraction via openpyxl"
```

---

## Task 4: Backend — convert-to-pdf endpoint (LibreOffice pipeline)

**Files:**
- Modify: `backend/converters.py`
- Modify: `backend/test_main.py`
- Modify: `backend/main.py`

- [ ] **Step 4.1: Write the failing test (skips if LibreOffice absent)**

Add to `backend/test_main.py`:
```python
import shutil

def test_convert_to_pdf_docx():
    if not shutil.which("libreoffice"):
        pytest.skip("LibreOffice not installed — skipping OCR pipeline test")

    docx_bytes = make_docx_bytes()
    r = client.post(
        "/api/convert-to-pdf",
        files={"file": ("document.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 200
    data = r.json()
    assert "pages" in data
    assert data["page_count"] >= 1
    assert data["filename"] == "document.docx"
    page = data["pages"][0]
    assert "image_base64" in page
    assert "page_number" in page
```

- [ ] **Step 4.2: Run to confirm it fails (or skips)**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py::test_convert_to_pdf_docx -v
```

Expected: `SKIPPED` (if LibreOffice absent) or `FAILED` with `NotImplementedError` (if present).

- [ ] **Step 4.3: Implement convert_to_pdf_bytes in converters.py**

Replace the `convert_to_pdf_bytes` stub in `backend/converters.py` with:
```python
def convert_to_pdf_bytes(content: bytes, filename: str) -> bytes:
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(content)

        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf", "--outdir", tmpdir, input_path],
            capture_output=True,
            timeout=120,
        )

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
```

- [ ] **Step 4.4: Add /api/convert-to-pdf endpoint to main.py**

Add after `/api/convert-direct` in `backend/main.py`:
```python
@app.post("/api/convert-to-pdf")
async def convert_to_pdf(file: UploadFile = File(...)):
    name = file.filename.lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""

    if ext not in SUPPORTED_OCR:
        raise HTTPException(
            status_code=400,
            detail=f"OCR mode supports .docx, .doc, .xlsx, .xls — got {ext}",
        )

    content = await file.read()

    try:
        pdf_bytes = convert_to_pdf_bytes(content, file.filename)
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="LibreOffice is not installed. Install it to use OCR mode for Word/Excel files.",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to open converted PDF: {e}")

    pages = []
    mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)

    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg", jpg_quality=90)
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        pages.append({
            "page_number": page_num + 1,
            "image_base64": img_b64,
            "width": pix.width,
            "height": pix.height,
        })

    doc.close()
    return {"page_count": len(pages), "pages": pages, "filename": file.filename}
```

- [ ] **Step 4.5: Run all backend tests**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk/backend && source venv/bin/activate && pytest test_main.py -v
```

Expected: all tests `PASSED` (or `SKIPPED` for LibreOffice test if not installed).

- [ ] **Step 4.6: Commit**

```bash
git add backend/converters.py backend/main.py backend/test_main.py
git commit -m "feat(backend): add /api/convert-to-pdf endpoint via LibreOffice"
```

---

## Task 5: Frontend — api.js additions

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 5.1: Add convertDirect and convertToPdf to api.js**

Replace `frontend/src/api.js` with:
```js
const BASE = '/api'

export async function uploadPDF(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function ocrPage(imageBase64, pageNumber) {
  const res = await fetch(`${BASE}/ocr-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBase64, page_number: pageNumber }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'OCR failed' }))
    throw new Error(err.detail || 'OCR failed')
  }
  return res.json()
}

export async function convertDirect(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/convert-direct`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Conversion failed' }))
    throw new Error(err.detail || 'Conversion failed')
  }
  return res.json()
}

export async function convertToPdf(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/convert-to-pdf`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Conversion failed' }))
    throw new Error(err.detail || 'Conversion failed')
  }
  return res.json()
}
```

- [ ] **Step 5.2: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): add convertDirect and convertToPdf API calls"
```

---

## Task 6: Frontend — DocInfoPanel + DirectView components

**Files:**
- Create: `frontend/src/components/DocInfoPanel.jsx`
- Create: `frontend/src/components/DirectView.jsx`

- [ ] **Step 6.1: Create DocInfoPanel.jsx**

Create `frontend/src/components/DocInfoPanel.jsx`:
```jsx
import { FileSpreadsheet, FileText } from 'lucide-react'

export default function DocInfoPanel({ info, filename }) {
  const isWord = info.type === 'word'
  const Icon = isWord ? FileText : FileSpreadsheet
  const label = isWord ? 'Word Document' : 'Excel Spreadsheet'

  return (
    <div className="p-6 bg-white h-full">
      <div className="bg-white rounded-xl shadow-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6 text-blue-500" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{filename}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        </div>

        {isWord && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Headings" value={info.headings} />
            <StatCard label="Paragraphs" value={info.paragraphs} />
            <StatCard label="Tables" value={info.tables} />
          </div>
        )}

        {!isWord && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sheets</p>
            {info.sheets.map((sheet) => (
              <div
                key={sheet.name}
                className="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
              >
                <span className="text-sm font-medium text-slate-700">{sheet.name}</span>
                <span className="text-xs text-slate-400">
                  {sheet.rows} rows × {sheet.cols} cols
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Converted via direct extraction — no OCR used
          </p>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}
```

- [ ] **Step 6.2: Create DirectView.jsx**

Create `frontend/src/components/DirectView.jsx`:
```jsx
import { useState } from 'react'
import { Code2, Download, Eye } from 'lucide-react'
import DocInfoPanel from './DocInfoPanel'
import MarkdownPanel from './MarkdownPanel'

export default function DirectView({ directResult, onDownload }) {
  const [markdownView, setMarkdownView] = useState('rendered')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="text-base">📄</span>
          <span className="font-medium text-slate-700 dark:text-slate-200 text-sm truncate max-w-xs">
            {directResult.filename}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 whitespace-nowrap">
            Direct extraction
          </span>
        </div>

        <button
          onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Download .md
        </button>

        <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          {[
            { key: 'rendered', icon: Eye, label: 'Preview' },
            { key: 'raw', icon: Code2, label: 'Raw' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setMarkdownView(key)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                markdownView === key
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Split panels */}
      <div className="flex-1 flex min-h-0">
        {/* Left — always white (document viewer area) */}
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-auto bg-slate-100">
          <DocInfoPanel info={directResult.info} filename={directResult.filename} />
        </div>
        {/* Right — dark-mode aware */}
        <div className="w-1/2 overflow-auto bg-white dark:bg-slate-900 flex flex-col">
          <MarkdownPanel
            markdown={directResult.markdown}
            view={markdownView}
            status="done"
            onOcr={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/components/DocInfoPanel.jsx frontend/src/components/DirectView.jsx
git commit -m "feat(frontend): add DocInfoPanel and DirectView components"
```

---

## Task 7: Frontend — UploadZone update + ConversionModeSelect component

**Files:**
- Modify: `frontend/src/components/UploadZone.jsx`
- Create: `frontend/src/components/ConversionModeSelect.jsx`

- [ ] **Step 7.1: Update UploadZone to accept Word and Excel files**

Replace `frontend/src/components/UploadZone.jsx` with:
```jsx
import { useCallback, useState } from 'react'
import { AlertCircle, FileText, Upload } from 'lucide-react'

const ACCEPTED_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls']
const ACCEPT_ATTR = ACCEPTED_EXTS.join(',')

function isAccepted(file) {
  if (!file) return false
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTS.some((ext) => name.endsWith(ext))
}

export default function UploadZone({ onFileSelect, isLoading, error }) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (isAccepted(file)) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragging(false), [])

  const handleInput = useCallback(
    (e) => {
      const file = e.target.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-3 tracking-tight">
          Document to Markdown
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-base">
          Upload a PDF, Word, or Excel file — convert to clean Markdown using direct
          extraction or GLM-OCR running locally on Ollama.
        </p>
      </div>

      <label
        className={[
          'relative flex flex-col items-center justify-center',
          'border-2 border-dashed rounded-2xl p-14 cursor-pointer',
          'transition-all duration-200 select-none',
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.015]'
            : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-700',
          isLoading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={handleInput}
          disabled={isLoading}
        />

        {isLoading ? (
          <>
            <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-5" />
            <p className="text-slate-600 dark:text-slate-300 font-semibold text-lg">Processing…</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Converting document</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-6">
              <Upload className="w-9 h-9 text-blue-500" strokeWidth={1.5} />
            </div>
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-xl mb-1.5">
              Drop your document here
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mb-6">or click to browse files</p>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 rounded-full px-4 py-1.5">
              <FileText className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400 text-sm">
                PDF · DOCX · DOC · XLSX · XLS
              </span>
            </div>
          </>
        )}
      </label>

      {error && (
        <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7.2: Create ConversionModeSelect.jsx**

Create `frontend/src/components/ConversionModeSelect.jsx`:
```jsx
import { AlertCircle } from 'lucide-react'

export default function ConversionModeSelect({
  file,
  fileType,
  mode,
  onModeChange,
  onStart,
  isLoading,
  error,
}) {
  const directSupported = fileType === 'docx' || fileType === 'xlsx' || fileType === 'xls'
  const isDoc = fileType === 'doc'

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Choose conversion mode
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm truncate px-4">{file.name}</p>
      </div>

      <div className="space-y-3 mb-6">
        {directSupported && (
          <label
            className={[
              'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
              mode === 'direct'
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500',
            ].join(' ')}
          >
            <input
              type="radio"
              name="conv-mode"
              value="direct"
              checked={mode === 'direct'}
              onChange={() => onModeChange('direct')}
              className="mt-1 accent-blue-500"
            />
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">Direct extraction</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Fast and accurate — reads text, tables, and headings directly from the file. No OCR needed.
              </p>
            </div>
          </label>
        )}

        <label
          className={[
            'flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
            mode === 'ocr'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500',
          ].join(' ')}
        >
          <input
            type="radio"
            name="conv-mode"
            value="ocr"
            checked={mode === 'ocr'}
            onChange={() => onModeChange('ocr')}
            className="mt-1 accent-blue-500"
          />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              OCR pipeline
              {isDoc && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  Required for .doc
                </span>
              )}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Converts to PDF via LibreOffice, then extracts text with GLM-OCR. Requires LibreOffice installed.
            </p>
          </div>
        </label>
      </div>

      <button
        onClick={() => onStart(mode)}
        disabled={isLoading}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 shadow-sm"
      >
        {isLoading ? 'Converting…' : 'Convert'}
      </button>

      {error && (
        <div className="mt-4 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-400 text-sm leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7.3: Commit**

```bash
git add frontend/src/components/UploadZone.jsx frontend/src/components/ConversionModeSelect.jsx
git commit -m "feat(frontend): update UploadZone for multi-format + add ConversionModeSelect"
```

---

## Task 8: Frontend — App.jsx wiring (file type routing + mode selection)

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 8.1: Replace App.jsx with full updated version**

Replace `frontend/src/App.jsx` with:
```jsx
import { useCallback, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import UploadZone from './components/UploadZone'
import SplitView from './components/SplitView'
import DirectView from './components/DirectView'
import ConversionModeSelect from './components/ConversionModeSelect'
import { convertDirect, convertToPdf, ocrPage, uploadPDF } from './api'

function getFileType(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'
  if (name.endsWith('.xlsx')) return 'xlsx'
  if (name.endsWith('.xls')) return 'xls'
  return null
}

export default function App() {
  const [appState, setAppState] = useState('idle') // idle | mode-select | uploading | ready
  const [pendingFile, setPendingFile] = useState(null)
  const [fileType, setFileType] = useState(null)
  const [conversionMode, setConversionMode] = useState('direct')
  const [pdfDoc, setPdfDoc] = useState(null)
  const [directResult, setDirectResult] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [ocrResults, setOcrResults] = useState({})
  const [ocrStatus, setOcrStatus] = useState({})
  const [uploadError, setUploadError] = useState(null)
  const [isOcrAllRunning, setIsOcrAllRunning] = useState(false)
  const ocrStatusRef = useRef({})

  const resetState = useCallback(() => {
    setAppState('idle')
    setPendingFile(null)
    setFileType(null)
    setConversionMode('direct')
    setPdfDoc(null)
    setDirectResult(null)
    setCurrentPage(0)
    setOcrResults({})
    setOcrStatus({})
    ocrStatusRef.current = {}
    setUploadError(null)
    setIsOcrAllRunning(false)
  }, [])

  const handleFileSelect = useCallback((file) => {
    setUploadError(null)
    const type = getFileType(file)
    if (!type) {
      setUploadError('Unsupported file type. Please use PDF, DOCX, DOC, XLSX, or XLS.')
      return
    }
    if (type === 'pdf') {
      setAppState('uploading')
      uploadPDF(file)
        .then((data) => {
          setPdfDoc(data)
          setConversionMode('ocr')
          setCurrentPage(0)
          setOcrResults({})
          setOcrStatus({})
          ocrStatusRef.current = {}
          setAppState('ready')
        })
        .catch((err) => {
          setUploadError(err.message || 'Failed to process PDF')
          setAppState('idle')
        })
    } else {
      setPendingFile(file)
      setFileType(type)
      setConversionMode(type === 'doc' ? 'ocr' : 'direct')
      setAppState('mode-select')
    }
  }, [])

  const handleStartConversion = useCallback(
    async (mode) => {
      if (!pendingFile) return
      setUploadError(null)
      setAppState('uploading')
      try {
        if (mode === 'direct') {
          const data = await convertDirect(pendingFile)
          setDirectResult({ markdown: data.markdown, info: data.info, filename: data.filename })
          setConversionMode('direct')
          setAppState('ready')
        } else {
          const data = await convertToPdf(pendingFile)
          setPdfDoc(data)
          setCurrentPage(0)
          setOcrResults({})
          setOcrStatus({})
          ocrStatusRef.current = {}
          setConversionMode('ocr')
          setAppState('ready')
        }
      } catch (err) {
        setUploadError(err.message || 'Conversion failed')
        setAppState('mode-select')
      }
    },
    [pendingFile],
  )

  const handleOcrPage = useCallback(
    async (pageIndex) => {
      if (!pdfDoc) return
      const page = pdfDoc.pages[pageIndex]
      const pageNum = page.page_number
      setOcrStatus((prev) => {
        const next = { ...prev, [pageNum]: 'loading' }
        ocrStatusRef.current = next
        return next
      })
      try {
        const result = await ocrPage(page.image_base64, pageNum)
        setOcrResults((prev) => ({ ...prev, [pageNum]: result.markdown }))
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: 'done' }
          ocrStatusRef.current = next
          return next
        })
      } catch {
        setOcrStatus((prev) => {
          const next = { ...prev, [pageNum]: 'error' }
          ocrStatusRef.current = next
          return next
        })
      }
    },
    [pdfDoc],
  )

  const handleOcrAll = useCallback(async () => {
    if (!pdfDoc || isOcrAllRunning) return
    setIsOcrAllRunning(true)
    for (let i = 0; i < pdfDoc.pages.length; i++) {
      const pageNum = pdfDoc.pages[i].page_number
      if (ocrStatusRef.current[pageNum] === 'done') continue
      await handleOcrPage(i)
    }
    setIsOcrAllRunning(false)
  }, [pdfDoc, isOcrAllRunning, handleOcrPage])

  const handleDownloadAll = useCallback(() => {
    if (!pdfDoc) return
    const combined = pdfDoc.pages
      .map((p) => {
        const md = ocrResults[p.page_number]
        return md
          ? `## Page ${p.page_number}\n\n${md}`
          : `## Page ${p.page_number}\n\n*(no OCR result)*`
      })
      .join('\n\n---\n\n')
    const blob = new Blob([combined], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdfDoc.filename.replace(/\.(pdf|docx?|xlsx?)$/i, '') + '.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [pdfDoc, ocrResults])

  const handleDirectDownload = useCallback(() => {
    if (!directResult) return
    const blob = new Blob([directResult.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = directResult.filename.replace(/\.(docx?|xlsx?)$/i, '') + '.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [directResult])

  const isUploading = appState === 'uploading'

  return (
    <div className="h-full flex flex-col">
      <Header onNew={appState === 'ready' ? resetState : null} />

      {appState === 'idle' && (
        <main className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <UploadZone
            onFileSelect={handleFileSelect}
            isLoading={false}
            error={uploadError}
          />
        </main>
      )}

      {appState === 'uploading' && (
        <main className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <UploadZone
            onFileSelect={handleFileSelect}
            isLoading={true}
            error={null}
          />
        </main>
      )}

      {appState === 'mode-select' && (
        <main className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
          <ConversionModeSelect
            file={pendingFile}
            fileType={fileType}
            mode={conversionMode}
            onModeChange={setConversionMode}
            onStart={handleStartConversion}
            isLoading={isUploading}
            error={uploadError}
          />
        </main>
      )}

      {appState === 'ready' && conversionMode === 'ocr' && pdfDoc && (
        <SplitView
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          ocrResults={ocrResults}
          ocrStatus={ocrStatus}
          onOcrPage={handleOcrPage}
          onOcrAll={handleOcrAll}
          onDownloadAll={handleDownloadAll}
          isOcrAllRunning={isOcrAllRunning}
        />
      )}

      {appState === 'ready' && conversionMode === 'direct' && directResult && (
        <DirectView directResult={directResult} onDownload={handleDirectDownload} />
      )}
    </div>
  )
}

function Header({ onNew }) {
  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm select-none">p</span>
        </div>
        <span className="font-bold text-lg tracking-tight">pdf2mrk</span>
        <span className="text-slate-500 text-sm hidden sm:inline">Docs → Markdown</span>
      </div>

      {onNew && (
        <button
          onClick={onNew}
          className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
        >
          <FileUp className="w-4 h-4" />
          New document
        </button>
      )}
    </header>
  )
}
```

- [ ] **Step 8.2: Start the dev server and verify Word/Excel upload flow works**

```bash
cd /Users/gbocchi/Desktop/pdf2mrk && ./start.sh
```

Test in browser at `http://localhost:5173`:
1. Upload a `.docx` file → mode selector appears with "Direct extraction" and "OCR pipeline" options
2. Choose Direct → markdown appears instantly in the right panel; left shows file info
3. Upload a `.pdf` → works exactly as before
4. Upload a `.doc` file → only "OCR pipeline" option shown (marked "Required for .doc")

- [ ] **Step 8.3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): wire file-type routing, mode selection, direct/OCR conversion paths"
```

---

## Task 9: Dark mode — Tailwind config, ThemeContext, flash-prevention script

**Files:**
- Modify: `frontend/tailwind.config.js`
- Create: `frontend/src/ThemeContext.jsx`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 9.1: Enable Tailwind dark mode class strategy**

Replace `frontend/tailwind.config.js` with:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
}
```

- [ ] **Step 9.2: Create ThemeContext.jsx**

Create `frontend/src/ThemeContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({ isDark: false, toggleTheme: () => {} })

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem('pdf2mrk-theme') === 'dark',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('pdf2mrk-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme: () => setIsDark((v) => !v) }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

- [ ] **Step 9.3: Add flash-prevention script to index.html**

In `frontend/index.html`, add this script tag immediately before the closing `</head>` tag (after existing `<link>` and `<script>` tags but before `</head>`):
```html
    <script>
      if (localStorage.getItem('pdf2mrk-theme') === 'dark') {
        document.documentElement.classList.add('dark')
      }
    </script>
```

- [ ] **Step 9.4: Wrap app in ThemeProvider in main.jsx**

Replace `frontend/src/main.jsx` with:
```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './ThemeContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 9.5: Update index.css with dark body + dark scrollbar**

Replace `frontend/src/index.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html,
  body,
  #root {
    height: 100%;
  }

  body {
    @apply bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 antialiased;
  }
}

/* Slim scrollbar — light mode */
::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  @apply bg-slate-300 rounded-full;
}
::-webkit-scrollbar-thumb:hover {
  @apply bg-slate-400;
}

/* Slim scrollbar — dark mode */
.dark ::-webkit-scrollbar-thumb {
  @apply bg-slate-600;
}
.dark ::-webkit-scrollbar-thumb:hover {
  @apply bg-slate-500;
}

/* Markdown table styling */
.prose table {
  display: block;
  overflow-x: auto;
  white-space: nowrap;
}
```

- [ ] **Step 9.6: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/ThemeContext.jsx frontend/index.html frontend/src/main.jsx frontend/src/index.css
git commit -m "feat(frontend): add dark mode infrastructure — Tailwind class strategy + ThemeContext + flash prevention"
```

---

## Task 10: Dark mode — Header toggle button

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 10.1: Add Moon/Sun toggle to Header in App.jsx**

In `frontend/src/App.jsx`, add these imports at the top:
```jsx
import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeContext'
```

Then update the `Header` function (find and replace the entire `Header` function):
```jsx
function Header({ onNew }) {
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm select-none">p</span>
        </div>
        <span className="font-bold text-lg tracking-tight">pdf2mrk</span>
        <span className="text-slate-500 text-sm hidden sm:inline">Docs → Markdown</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-slate-300" />
          ) : (
            <Moon className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {onNew && (
          <button
            onClick={onNew}
            className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <FileUp className="w-4 h-4" />
            New document
          </button>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 10.2: Verify toggle works in browser**

With the dev server running, click the Moon/Sun icon in the header. The page background, upload zone, and overall UI should toggle between light and dark.

- [ ] **Step 10.3: Verify localStorage persistence**

In dark mode, reload the page. The dark mode should apply immediately (no flash) because of the script in index.html.

- [ ] **Step 10.4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): add dark mode toggle button (Moon/Sun) to header"
```

---

## Task 11: Dark mode — component dark variants

**Files:**
- Modify: `frontend/src/components/SplitView.jsx`
- Modify: `frontend/src/components/MarkdownPanel.jsx`

- [ ] **Step 11.1: Update SplitView.jsx with dark variants**

Replace `frontend/src/components/SplitView.jsx` with:
```jsx
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Eye,
  Scan,
  ScanLine,
} from 'lucide-react'
import MarkdownPanel from './MarkdownPanel'
import PageViewer from './PageViewer'

export default function SplitView({
  pdfDoc,
  currentPage,
  onPageChange,
  ocrResults,
  ocrStatus,
  onOcrPage,
  onOcrAll,
  onDownloadAll,
  isOcrAllRunning,
}) {
  const [markdownView, setMarkdownView] = useState('rendered')

  const page = pdfDoc.pages[currentPage]
  const pageNum = page.page_number
  const totalPages = pdfDoc.pages.length
  const currentStatus = ocrStatus[pageNum] || 'idle'
  const currentMarkdown = ocrResults[pageNum] || ''
  const doneCount = Object.values(ocrStatus).filter((s) => s === 'done').length
  const allDone = doneCount === totalPages

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Toolbar ── */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 flex items-center gap-3 flex-shrink-0 flex-wrap">
        {/* Filename + progress */}
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <span className="text-base">📄</span>
          <span className="font-medium text-slate-700 dark:text-slate-200 text-sm truncate max-w-xs">
            {pdfDoc.filename}
          </span>
          <span
            className={[
              'text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
              allDone
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
            ].join(' ')}
          >
            {doneCount}/{totalPages} OCR'd
          </span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 px-2 tabular-nums">
            {pageNum} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage === totalPages - 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* OCR controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOcrPage(currentPage)}
            disabled={currentStatus === 'loading' || isOcrAllRunning}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shadow-sm',
              currentStatus === 'loading' || isOcrAllRunning
                ? 'bg-blue-100 text-blue-400 cursor-not-allowed shadow-none'
                : 'bg-blue-500 hover:bg-blue-600 text-white',
            ].join(' ')}
          >
            {currentStatus === 'loading' ? (
              <Spinner className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Scan className="w-3.5 h-3.5" />
            )}
            OCR page
          </button>

          <button
            onClick={onOcrAll}
            disabled={isOcrAllRunning || allDone}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
              isOcrAllRunning || allDone
                ? 'border-slate-200 dark:border-slate-600 text-slate-400 cursor-not-allowed bg-slate-50 dark:bg-slate-700'
                : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
            ].join(' ')}
          >
            {isOcrAllRunning ? (
              <Spinner className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ScanLine className="w-3.5 h-3.5" />
            )}
            OCR all
          </button>

          {doneCount > 0 && (
            <button
              onClick={onDownloadAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
              title="Download all OCR results as a single Markdown file"
            >
              <Download className="w-3.5 h-3.5" />
              Download .md
            </button>
          )}
        </div>

        {/* Rendered / Raw toggle */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
          {[
            { key: 'rendered', icon: Eye, label: 'Preview' },
            { key: 'raw', icon: Code2, label: 'Raw' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setMarkdownView(key)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                markdownView === key
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Page status strip ── */}
      {totalPages > 1 && (
        <div className="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 px-4 py-1.5 flex items-center gap-1 overflow-x-auto flex-shrink-0">
          {pdfDoc.pages.map((p, i) => {
            const s = ocrStatus[p.page_number] || 'idle'
            return (
              <button
                key={p.page_number}
                onClick={() => onPageChange(i)}
                title={`Page ${p.page_number}`}
                className={[
                  'w-6 h-6 rounded-md text-xs font-medium transition-all flex-shrink-0',
                  i === currentPage ? 'ring-2 ring-blue-400 ring-offset-1' : '',
                  s === 'done'
                    ? 'bg-green-100 text-green-700'
                    : s === 'loading'
                      ? 'bg-blue-100 text-blue-500 animate-pulse'
                      : s === 'error'
                        ? 'bg-red-100 text-red-500'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
                ].join(' ')}
              >
                {p.page_number}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Split panels ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left — always light (document viewer) */}
        <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-auto bg-slate-100">
          <PageViewer page={page} status={currentStatus} />
        </div>
        {/* Right — dark-mode aware */}
        <div className="w-1/2 overflow-auto bg-white dark:bg-slate-900 flex flex-col">
          <MarkdownPanel
            markdown={currentMarkdown}
            view={markdownView}
            status={currentStatus}
            onOcr={() => onOcrPage(currentPage)}
          />
        </div>
      </div>
    </div>
  )
}

function Spinner({ className = '' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
```

- [ ] **Step 11.2: Update MarkdownPanel.jsx with dark variants**

Replace `frontend/src/components/MarkdownPanel.jsx` with:
```jsx
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Download, Scan } from 'lucide-react'

export default function MarkdownPanel({ markdown, view, status, onOcr }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'page.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (status === 'idle' || (!markdown && status !== 'loading' && status !== 'error')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-5">
          <Scan className="w-8 h-8 text-slate-400" strokeWidth={1.5} />
        </div>
        <p className="text-slate-600 dark:text-slate-300 font-semibold mb-1.5">No OCR result yet</p>
        <p className="text-slate-400 dark:text-slate-500 text-sm mb-7 max-w-xs">
          Click "OCR page" in the toolbar to extract text from this page using GLM-OCR
        </p>
        <button
          onClick={onOcr}
          className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Run OCR on this page
        </button>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="animate-spin w-12 h-12 text-blue-500 mx-auto mb-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-slate-600 dark:text-slate-300 font-semibold">Extracting text with GLM-OCR…</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">This may take a moment</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl p-8 max-w-xs">
          <p className="text-red-500 font-semibold mb-2">OCR failed</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
            Make sure Ollama is running and{' '}
            <code className="bg-red-50 dark:bg-red-900/30 px-1 rounded">glm-ocr:latest</code>{' '}
            is installed.
          </p>
          <button
            onClick={onOcr}
            className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Save .md
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === 'raw' ? (
          <pre className="p-6 text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {markdown}
          </pre>
        ) : (
          <div className="p-8">
            <div className="prose prose-slate dark:prose-invert prose-sm max-w-none prose-headings:font-semibold prose-table:text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 11.3: Full dark mode verification in browser**

With the dev server running at `http://localhost:5173`:
1. Toggle dark mode — the entire UI goes dark (header already dark, main content + markdown panel darken)
2. Upload a PDF, run OCR on a page — markdown panel shows dark text on dark background, prose renders correctly
3. The **left panel** (PDF page image) stays with a light background in both modes
4. Upload a `.docx` in direct mode — DocInfoPanel on the left stays white; markdown on the right is dark
5. Reload the page in dark mode — no flash, starts dark immediately

- [ ] **Step 11.4: Commit**

```bash
git add frontend/src/components/SplitView.jsx frontend/src/components/MarkdownPanel.jsx
git commit -m "feat(frontend): add dark mode variants to SplitView and MarkdownPanel"
```

---

## Verification Checklist

Run these end-to-end checks before considering the feature complete:

- [ ] **PDF flow (unchanged):** Upload a `.pdf` → pages appear on left → OCR page → markdown on right → download `.md` ✓
- [ ] **Word direct:** Upload a `.docx` → mode selector appears → choose Direct → instantly shows structural info left + markdown right → download works
- [ ] **Excel direct:** Upload a `.xlsx` → choose Direct → shows sheet list on left with row/col counts → markdown has one `## Sheet:` section per sheet
- [ ] **Word OCR:** Upload a `.docx` → choose OCR → pages appear on left → OCR per page works (requires LibreOffice)
- [ ] **`.doc` files:** Mode selector shows only OCR option with "Required for .doc" badge
- [ ] **Dark mode toggle:** Moon/Sun in header toggles all UI + markdown panel; left panel stays white
- [ ] **Dark mode persistence:** Dark mode survives page reload without visible flash
- [ ] **Backend tests pass:** `cd backend && pytest test_main.py -v` → all green (LibreOffice test skips if absent)
