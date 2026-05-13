#!/usr/bin/env python3
"""
convert.py — Batch PDF → Markdown via GLM-OCR on Ollama.

Reads every PDF in <raw_dir>, converts it page-by-page using the local
Ollama GLM-OCR model, and writes one Markdown file per PDF to <output_dir>.

Usage:
    python convert.py [options]

Options:
    -i, --input   DIR   Input folder  (default: ../raw)
    -o, --output  DIR   Output folder (default: ../output)
    -f, --force         Re-process files that already have an output
    --dpi         INT   Render resolution in DPI (default: 200)
    --model       STR   Ollama model name (default: glm-ocr:latest)
    --ollama-url  URL   Ollama endpoint (default: http://localhost:11434/api/generate)
    --timeout     SEC   Per-page OCR timeout in seconds (default: 180)
"""

import argparse
import base64
import sys
import time
from pathlib import Path

import fitz  # PyMuPDF
import httpx

# ── Defaults ──────────────────────────────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPTS_DIR.parent

DEFAULT_INPUT = ROOT_DIR / "raw"
DEFAULT_OUTPUT = ROOT_DIR / "output"
DEFAULT_MODEL = "glm-ocr:latest"
DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_DPI = 200
DEFAULT_TIMEOUT = 180

OCR_PROMPT = (
    "Convert the content of this document page to clean, well-structured Markdown. "
    "Preserve all text exactly. Format tables using Markdown table syntax (| col | col |). "
    "Use appropriate heading levels (#, ##, ###). Format lists with - or 1. "
    "Wrap code snippets in backticks. For figures or diagrams write [Figure: brief description]. "
    "Output only the Markdown content, no preamble or explanation."
)

# ── Colours (graceful fallback on non-ANSI terminals) ────────────────────────

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text

def green(t):  return _c("32", t)
def yellow(t): return _c("33", t)
def red(t):    return _c("31", t)
def bold(t):   return _c("1",  t)
def dim(t):    return _c("2",  t)

# ── Core helpers ──────────────────────────────────────────────────────────────

def render_pages(pdf_path: Path, dpi: int) -> list[tuple[int, str]]:
    """Return [(page_number, base64_jpeg), ...] for every page in the PDF."""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    doc = fitz.open(str(pdf_path))
    pages = []
    try:
        for i in range(len(doc)):
            pix = doc[i].get_pixmap(matrix=mat)
            jpeg = pix.tobytes("jpeg", jpg_quality=90)
            b64 = base64.b64encode(jpeg).decode()
            pages.append((i + 1, b64))
    finally:
        doc.close()
    return pages


def ocr_page(
    b64_image: str,
    *,
    model: str,
    ollama_url: str,
    timeout: int,
) -> str:
    """Send one page image to Ollama and return the markdown string."""
    payload = {
        "model": model,
        "prompt": OCR_PROMPT,
        "images": [b64_image],
        "stream": False,
    }
    with httpx.Client(timeout=timeout) as client:
        resp = client.post(ollama_url, json=payload)
        resp.raise_for_status()
        return resp.json().get("response", "").strip()


def check_ollama(ollama_url: str, model: str, timeout: int) -> None:
    """Fail fast if Ollama is unreachable or the model is missing."""
    base = ollama_url.rstrip("/api/generate").rstrip("/")
    try:
        r = httpx.get(f"{base}/api/tags", timeout=10)
        r.raise_for_status()
        names = [m["name"] for m in r.json().get("models", [])]
        if not any(n.startswith(model.split(":")[0]) for n in names):
            print(yellow(f"  Warning: model '{model}' not found in Ollama. "
                         f"Available: {', '.join(names) or 'none'}"))
    except httpx.ConnectError:
        print(red(f"  Error: cannot reach Ollama at {ollama_url}"))
        print(red("  Make sure 'ollama serve' is running."))
        sys.exit(1)


def convert_file(
    pdf_path: Path,
    output_dir: Path,
    *,
    dpi: int,
    model: str,
    ollama_url: str,
    timeout: int,
) -> dict:
    """
    Convert a single PDF to Markdown.
    Returns a result dict with keys: pages, failed, skipped_pages, duration.
    """
    t0 = time.time()
    print(f"\n  Rendering pages at {dpi} DPI…", end=" ", flush=True)
    pages = render_pages(pdf_path, dpi)
    print(f"{len(pages)} page(s) ready.")

    sections: list[str] = []
    failed_pages: list[int] = []

    for page_num, b64 in pages:
        prefix = f"  Page {page_num:>3}/{len(pages)}"
        print(f"{prefix}  OCR… ", end="", flush=True)
        pt0 = time.time()
        try:
            md = ocr_page(b64, model=model, ollama_url=ollama_url, timeout=timeout)
            elapsed = time.time() - pt0
            print(green(f"done") + dim(f"  ({elapsed:.1f}s)"))
            sections.append(f"<!-- page {page_num} -->\n\n{md}")
        except httpx.TimeoutException:
            print(yellow("timeout — skipped"))
            failed_pages.append(page_num)
            sections.append(f"<!-- page {page_num} -->\n\n*(OCR timed out)*")
        except Exception as exc:
            print(red(f"error — {exc}"))
            failed_pages.append(page_num)
            sections.append(f"<!-- page {page_num} -->\n\n*(OCR failed: {exc})*")

    markdown = "\n\n---\n\n".join(sections)
    output_path = output_dir / (pdf_path.stem + ".md")
    output_path.write_text(markdown, encoding="utf-8")

    return {
        "pages": len(pages),
        "failed": len(failed_pages),
        "failed_pages": failed_pages,
        "duration": time.time() - t0,
        "output": output_path,
    }

# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Batch-convert PDFs in <input> to Markdown using GLM-OCR on Ollama.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("-i", "--input",      default=str(DEFAULT_INPUT),      metavar="DIR")
    p.add_argument("-o", "--output",     default=str(DEFAULT_OUTPUT),     metavar="DIR")
    p.add_argument("-f", "--force",      action="store_true",
                   help="Re-process files that already have an output")
    p.add_argument("--dpi",             default=DEFAULT_DPI,   type=int,  metavar="INT")
    p.add_argument("--model",           default=DEFAULT_MODEL,            metavar="STR")
    p.add_argument("--ollama-url",      default=DEFAULT_OLLAMA_URL,       metavar="URL")
    p.add_argument("--timeout",         default=DEFAULT_TIMEOUT, type=int, metavar="SEC")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    raw_dir    = Path(args.input).expanduser().resolve()
    output_dir = Path(args.output).expanduser().resolve()

    # ── Sanity checks ──
    if not raw_dir.is_dir():
        print(red(f"Input folder not found: {raw_dir}"))
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(raw_dir.glob("*.pdf"))
    if not pdfs:
        print(yellow(f"No PDF files found in {raw_dir}"))
        sys.exit(0)

    print(bold(f"\npdf2mrk — batch converter"))
    print(dim(f"  input  : {raw_dir}"))
    print(dim(f"  output : {output_dir}"))
    print(dim(f"  model  : {args.model}  |  DPI: {args.dpi}  |  timeout: {args.timeout}s"))

    check_ollama(args.ollama_url, args.model, args.timeout)

    # ── Filter already-done files ──
    to_process = []
    skipped = []
    for pdf in pdfs:
        out = output_dir / (pdf.stem + ".md")
        if out.exists() and not args.force:
            skipped.append(pdf)
        else:
            to_process.append(pdf)

    if skipped:
        print(dim(f"\n  Skipping {len(skipped)} already-converted file(s) "
                  f"(use --force to re-process):"))
        for f in skipped:
            print(dim(f"    • {f.name}"))

    if not to_process:
        print(green("\n  All files already converted. Nothing to do."))
        sys.exit(0)

    print(f"\n  Converting {bold(str(len(to_process)))} file(s)…")

    # ── Main loop ──
    total_t0 = time.time()
    results = {}

    for idx, pdf in enumerate(to_process, 1):
        header = f"[{idx}/{len(to_process)}] {bold(pdf.name)}"
        print(f"\n{'─' * 60}")
        print(f"  {header}")

        try:
            r = convert_file(
                pdf,
                output_dir,
                dpi=args.dpi,
                model=args.model,
                ollama_url=args.ollama_url,
                timeout=args.timeout,
            )
            results[pdf.name] = r
            status = (
                green("✓ OK") if r["failed"] == 0
                else yellow(f"✓ done  ({r['failed']} page(s) failed: {r['failed_pages']})")
            )
            print(f"\n  {status}  →  {dim(str(r['output']))}")
            print(dim(f"  {r['pages']} pages in {r['duration']:.1f}s"))
        except Exception as exc:
            print(red(f"\n  ✗ Failed: {exc}"))
            results[pdf.name] = {"error": str(exc)}

    # ── Summary ──
    total_elapsed = time.time() - total_t0
    ok    = sum(1 for r in results.values() if "error" not in r and r.get("failed", 0) == 0)
    warn  = sum(1 for r in results.values() if "error" not in r and r.get("failed", 0) > 0)
    fail  = sum(1 for r in results.values() if "error" in r)

    print(f"\n{'═' * 60}")
    print(bold("  Summary"))
    print(f"  {green(f'{ok} converted')}  "
          f"{yellow(f'{warn} with warnings') if warn else ''}  "
          f"{red(f'{fail} failed') if fail else ''}".rstrip())
    print(dim(f"  Total time: {total_elapsed:.1f}s"))
    print(f"  Output in: {output_dir}\n")

    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
