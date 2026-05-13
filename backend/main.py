import base64

import fitz  # PyMuPDF
import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="pdf2mrk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_URL = "http://localhost:11434/api/generate"
OCR_MODEL = "glm-ocr:latest"
RENDER_DPI = 200


class OcrPageRequest(BaseModel):
    image_base64: str
    page_number: int


class OcrPageResponse(BaseModel):
    page_number: int
    markdown: str


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to open PDF: {e}")

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


@app.post("/api/ocr-page", response_model=OcrPageResponse)
async def ocr_page(request: OcrPageRequest):
    prompt = (
        "Convert the content of this document page to clean, well-structured Markdown. "
        "Preserve all text exactly. Format tables using Markdown table syntax (| col | col |). "
        "Use appropriate heading levels (#, ##, ###). Format lists with - or 1. "
        "Wrap code snippets in backticks. For figures or diagrams write [Figure: brief description]. "
        "Output only the Markdown content, no preamble or explanation."
    )

    payload = {
        "model": OCR_MODEL,
        "prompt": prompt,
        "images": [request.image_base64],
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        try:
            response = await client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            markdown = data.get("response", "").strip()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Cannot connect to Ollama. Make sure it is running on http://localhost:11434",
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Ollama returned status {e.response.status_code}",
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return OcrPageResponse(page_number=request.page_number, markdown=markdown)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
