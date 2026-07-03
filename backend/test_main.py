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
