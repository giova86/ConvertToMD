import base64
import os
from typing import Literal

import fitz  # PyMuPDF
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from converters import docx_to_markdown, xlsx_to_markdown, convert_to_pdf_bytes, extract_pdf_page_images
import settings_store
from llm_backends import get_backend, BackendConnectionError, BackendResponseError

app = FastAPI(title="ConvertToMD API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

RENDER_DPI = 200


def _render_pages(doc) -> list[dict]:
    """Render every page to JPEG and extract its embedded figures as PNG crops."""
    pages = []
    mat = fitz.Matrix(RENDER_DPI / 72, RENDER_DPI / 72)
    seen_xrefs: set = set()
    counter = 0
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("jpeg", jpg_quality=90)
        figures = []
        for fig in extract_pdf_page_images(page, seen_xrefs, RENDER_DPI):
            counter += 1
            figures.append({
                "name": f"page{page_num + 1}_image{counter}.png",
                "image_base64": base64.b64encode(fig["png"]).decode("utf-8"),
                "before_text": fig["before"],
                "after_text": fig["after"],
                "at_start": fig["at_start"],
            })
        pages.append({
            "page_number": page_num + 1,
            "image_base64": base64.b64encode(img_bytes).decode("utf-8"),
            "width": pix.width,
            "height": pix.height,
            "figures": figures,
        })
    return pages


class OcrPageRequest(BaseModel):
    image_base64: str
    page_number: int
    model: str | None = None


class OcrPageResponse(BaseModel):
    page_number: int
    markdown: str


class SettingsModel(BaseModel):
    backend_type: Literal["ollama", "lmstudio", "vllm"]
    base_url: str
    api_key: str | None = None
    default_model: str


class ModelsResponse(BaseModel):
    models: list[str]


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to open PDF: {e}")

    try:
        pages = _render_pages(doc)
    finally:
        doc.close()

    return {"page_count": len(pages), "pages": pages, "filename": file.filename}


SUPPORTED_DIRECT = {".docx", ".xlsx", ".xls"}
SUPPORTED_OCR = {".docx", ".doc", ".xlsx", ".xls"}  # used by /api/convert-to-pdf (Task 4)


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

    images: dict[str, bytes] = {}
    try:
        if ext == ".docx":
            markdown, info = docx_to_markdown(content, images)
        else:
            markdown, info = xlsx_to_markdown(content)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Conversion failed: {e}")

    return {
        "filename": file.filename,
        "markdown": markdown,
        "info": info,
        "images": [
            {"name": n, "image_base64": base64.b64encode(b).decode("utf-8")}
            for n, b in images.items()
        ],
    }


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
        safe_filename = os.path.basename(file.filename)
        pdf_bytes = convert_to_pdf_bytes(content, safe_filename)
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

    try:
        pages = _render_pages(doc)
    finally:
        doc.close()

    return {"page_count": len(pages), "pages": pages, "filename": file.filename}


@app.post("/api/ocr-page", response_model=OcrPageResponse)
async def ocr_page(request: OcrPageRequest):
    prompt = (
        "Convert the content of this document page to clean, well-structured Markdown. "
        "Preserve all text exactly. Format tables using Markdown table syntax (| col | col |). "
        "Use appropriate heading levels (#, ##, ###). Format lists with - or 1. "
        "Wrap code snippets in backticks. For figures or diagrams write [Figure: brief description]. "
        "Output only the Markdown content, no preamble or explanation."
    )

    settings = settings_store.load_settings()
    model = request.model or settings["default_model"]
    backend = get_backend(settings["backend_type"], settings["base_url"], settings["api_key"])

    try:
        markdown = await backend.ocr_image(request.image_base64, prompt, model)
    except BackendConnectionError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot connect to {settings['backend_type']} at {settings['base_url']}",
        )
    except BackendResponseError as e:
        raise HTTPException(status_code=502, detail=f"{settings['backend_type']} returned an error: {e}")

    return OcrPageResponse(page_number=request.page_number, markdown=markdown)


@app.get("/api/settings", response_model=SettingsModel)
async def get_settings():
    return SettingsModel(**settings_store.load_settings())


@app.put("/api/settings", response_model=SettingsModel)
async def put_settings(settings: SettingsModel):
    saved = settings_store.save_settings(settings.model_dump())
    return SettingsModel(**saved)


@app.get("/api/models", response_model=ModelsResponse)
async def get_models(
    backend_type: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
):
    settings = settings_store.load_settings()
    bt = backend_type or settings["backend_type"]
    bu = base_url or settings["base_url"]
    ak = api_key if api_key is not None else settings["api_key"]

    try:
        backend = get_backend(bt, bu, ak)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        models = await backend.list_models()
    except BackendConnectionError:
        raise HTTPException(status_code=503, detail=f"Cannot connect to {bt} at {bu}")
    except BackendResponseError as e:
        raise HTTPException(status_code=502, detail=f"{bt} returned an error: {e}")

    return ModelsResponse(models=models)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Packaged app: serve the built frontend from the same origin as the API.
_dist = os.environ.get("CONVERTTOMD_FRONTEND_DIST")
if _dist and os.path.isdir(_dist):
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
