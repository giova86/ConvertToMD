import io
import shutil

import pytest
from docx import Document
from fastapi.testclient import TestClient
import openpyxl

from main import app
import settings_store
import llm_backends

client = TestClient(app)


def make_docx_bytes() -> bytes:
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


def test_get_settings_returns_defaults_when_no_config(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))

    r = client.get("/api/settings")

    assert r.status_code == 200
    data = r.json()
    assert data["backend_type"] == "ollama"
    assert data["base_url"] == "http://localhost:11434"
    assert data["default_model"] == "glm-ocr:latest"
    assert data["api_key"] is None


def test_put_settings_persists_and_returns_saved_values(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))

    r = client.put("/api/settings", json={
        "backend_type": "lmstudio",
        "base_url": "http://localhost:1234",
        "api_key": "sk-test",
        "default_model": "qwen2-vl-7b",
    })

    assert r.status_code == 200
    data = r.json()
    assert data["backend_type"] == "lmstudio"
    assert data["default_model"] == "qwen2-vl-7b"

    r2 = client.get("/api/settings")
    assert r2.json()["backend_type"] == "lmstudio"


def test_put_settings_rejects_unknown_backend_type(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))

    r = client.put("/api/settings", json={
        "backend_type": "not-a-real-backend",
        "base_url": "http://localhost:1234",
        "default_model": "x",
    })

    assert r.status_code == 422


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


class _FakeBackend:
    def __init__(self, models=None, raises=None):
        self._models = models or []
        self._raises = raises

    async def list_models(self):
        if self._raises:
            raise self._raises
        return self._models

    async def ocr_image(self, image_b64, prompt, model):
        if self._raises:
            raise self._raises
        return "# fake markdown"


def test_get_models_uses_saved_settings_by_default(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    settings_store.save_settings({
        "backend_type": "ollama",
        "base_url": "http://localhost:11434",
        "api_key": None,
        "default_model": "glm-ocr:latest",
    })
    monkeypatch.setattr(
        "main.get_backend",
        lambda backend_type, base_url, api_key=None: _FakeBackend(models=["glm-ocr:latest", "llava:latest"]),
    )

    r = client.get("/api/models")

    assert r.status_code == 200
    assert r.json() == {"models": ["glm-ocr:latest", "llava:latest"]}


def test_get_models_query_params_override_saved_settings(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    captured = {}

    def fake_get_backend(backend_type, base_url, api_key=None):
        captured["backend_type"] = backend_type
        captured["base_url"] = base_url
        return _FakeBackend(models=["qwen2-vl-7b"])

    monkeypatch.setattr("main.get_backend", fake_get_backend)

    r = client.get("/api/models", params={"backend_type": "lmstudio", "base_url": "http://localhost:1234"})

    assert r.status_code == 200
    assert captured == {"backend_type": "lmstudio", "base_url": "http://localhost:1234"}


def test_get_models_returns_503_on_connection_error(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(
        "main.get_backend",
        lambda backend_type, base_url, api_key=None: _FakeBackend(raises=llm_backends.BackendConnectionError("refused")),
    )

    r = client.get("/api/models")

    assert r.status_code == 503


def test_get_models_returns_502_on_backend_error(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(
        "main.get_backend",
        lambda backend_type, base_url, api_key=None: _FakeBackend(raises=llm_backends.BackendResponseError("status 500")),
    )

    r = client.get("/api/models")

    assert r.status_code == 502


def test_get_models_returns_400_for_invalid_backend_type(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))

    r = client.get("/api/models", params={"backend_type": "not-a-real-backend", "base_url": "http://localhost:1"})

    assert r.status_code == 400


def test_ocr_page_uses_request_model_when_provided(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    settings_store.save_settings({
        "backend_type": "ollama",
        "base_url": "http://localhost:11434",
        "api_key": None,
        "default_model": "glm-ocr:latest",
    })
    captured = {}

    class RecordingBackend(_FakeBackend):
        async def ocr_image(self, image_b64, prompt, model):
            captured["model"] = model
            return "# recorded"

    monkeypatch.setattr("main.get_backend", lambda backend_type, base_url, api_key=None: RecordingBackend())

    r = client.post("/api/ocr-page", json={
        "image_base64": "abc",
        "page_number": 1,
        "model": "llava:latest",
    })

    assert r.status_code == 200
    assert r.json()["markdown"] == "# recorded"
    assert captured["model"] == "llava:latest"


def test_ocr_page_falls_back_to_default_model_when_omitted(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    settings_store.save_settings({
        "backend_type": "ollama",
        "base_url": "http://localhost:11434",
        "api_key": None,
        "default_model": "glm-ocr:latest",
    })
    captured = {}

    class RecordingBackend(_FakeBackend):
        async def ocr_image(self, image_b64, prompt, model):
            captured["model"] = model
            return "# recorded"

    monkeypatch.setattr("main.get_backend", lambda backend_type, base_url, api_key=None: RecordingBackend())

    r = client.post("/api/ocr-page", json={"image_base64": "abc", "page_number": 1})

    assert r.status_code == 200
    assert captured["model"] == "glm-ocr:latest"


def test_ocr_page_returns_503_when_backend_unreachable(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(
        "main.get_backend",
        lambda backend_type, base_url, api_key=None: _FakeBackend(raises=llm_backends.BackendConnectionError("refused")),
    )

    r = client.post("/api/ocr-page", json={"image_base64": "abc", "page_number": 1})

    assert r.status_code == 503


def _png_bytes(size=120, color=(200, 30, 30)) -> bytes:
    import fitz
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, size, size), False)
    pix.set_rect(pix.irect, color)
    return pix.tobytes("png")


def test_docx_images_extracted_and_referenced(tmp_path):
    from docx.shared import Inches
    png = tmp_path / "pic.png"
    png.write_bytes(_png_bytes())
    doc = Document()
    doc.add_paragraph("Before")
    doc.add_picture(str(png), width=Inches(2))
    doc.add_picture(str(png), width=Inches(2))  # duplicate -> same file
    doc.add_paragraph("After")
    buf = io.BytesIO()
    doc.save(buf)

    from converters import docx_to_markdown
    images = {}
    md, info = docx_to_markdown(buf.getvalue(), images)
    assert list(images) == ["image_1.png"]
    assert md.index("Before") < md.index("![](images/image_1.png)") < md.index("After")
    assert info["images"] == 2


def test_convert_direct_docx_returns_images(tmp_path):
    from docx.shared import Inches
    png = tmp_path / "pic.png"
    png.write_bytes(_png_bytes())
    doc = Document()
    doc.add_picture(str(png), width=Inches(2))
    buf = io.BytesIO()
    doc.save(buf)
    resp = client.post("/api/convert-direct", files={"file": ("d.docx", buf.getvalue(), "application/octet-stream")})
    assert resp.status_code == 200
    assert resp.json()["images"][0]["name"] == "image_1.png"


def test_upload_pdf_extracts_figures_and_skips_page_sized_images():
    import fitz
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 60), "hello")
    page.insert_image(fitz.Rect(72, 100, 272, 300), stream=_png_bytes(200))
    page.insert_image(fitz.Rect(300, 100, 310, 110), stream=_png_bytes(20))  # tiny
    p2 = pdf.new_page()
    p2.insert_image(p2.rect, stream=_png_bytes(200))  # page-sized scan
    resp = client.post("/api/upload", files={"file": ("a.pdf", pdf.tobytes(), "application/pdf")})
    assert resp.status_code == 200
    pages = resp.json()["pages"]
    assert [f["name"] for f in pages[0]["figures"]] == ["page1_image1.png"]
    assert pages[1]["figures"] == []


def test_upload_pdf_extracts_vector_figures_but_not_tables():
    import fitz
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 60), "Intro text")
    for i in range(12):  # vector "plot": a cluster of circles
        page.draw_circle((120 + 12 * i, 200 + 15 * (i % 4)), 8, color=(0, 0, 1), fill=(0.7, 0.8, 1))
    page.insert_text((72, 330), "Figure 1. caption")
    for i in range(6):  # table-like: only straight rules
        page.draw_line((72, 400 + 20 * i), (400, 400 + 20 * i))
    resp = client.post("/api/upload", files={"file": ("v.pdf", pdf.tobytes(), "application/pdf")})
    assert resp.status_code == 200
    figures = resp.json()["pages"][0]["figures"]
    assert len(figures) == 1
