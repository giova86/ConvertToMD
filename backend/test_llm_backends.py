import asyncio

import httpx
import pytest

import llm_backends


def _patch_client(monkeypatch, transport):
    original_client = httpx.AsyncClient
    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


def test_ollama_list_models(monkeypatch):
    def handler(request):
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": "glm-ocr:latest"}, {"name": "llava:latest"}]})

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OllamaBackend("http://localhost:11434")

    models = asyncio.run(backend.list_models())

    assert models == ["glm-ocr:latest", "llava:latest"]


def test_ollama_ocr_image(monkeypatch):
    def handler(request):
        assert request.url.path == "/api/generate"
        return httpx.Response(200, json={"response": "# Hello\n\nWorld"})

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OllamaBackend("http://localhost:11434")

    result = asyncio.run(backend.ocr_image("base64data", "convert this", "glm-ocr:latest"))

    assert result == "# Hello\n\nWorld"


def test_ollama_connection_error_maps_to_backend_connection_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("refused", request=request)

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OllamaBackend("http://localhost:11434")

    with pytest.raises(llm_backends.BackendConnectionError):
        asyncio.run(backend.list_models())


def test_ollama_error_status_maps_to_backend_response_error(monkeypatch):
    def handler(request):
        return httpx.Response(500, json={"error": "boom"})

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OllamaBackend("http://localhost:11434")

    with pytest.raises(llm_backends.BackendResponseError):
        asyncio.run(backend.list_models())


def test_openai_compat_list_models(monkeypatch):
    def handler(request):
        assert request.url.path == "/v1/models"
        return httpx.Response(200, json={"data": [{"id": "qwen2-vl-7b"}]})

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OpenAICompatBackend("http://localhost:1234")

    models = asyncio.run(backend.list_models())

    assert models == ["qwen2-vl-7b"]


def test_openai_compat_ocr_image_sends_image_url_and_returns_content(monkeypatch):
    def handler(request):
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "# Extracted text"}}]
        })

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OpenAICompatBackend("http://localhost:1234")

    result = asyncio.run(backend.ocr_image("base64data", "convert this", "qwen2-vl-7b"))

    assert result == "# Extracted text"


def test_openai_compat_sends_authorization_header_when_api_key_set(monkeypatch):
    seen_headers = {}

    def handler(request):
        seen_headers.update(request.headers)
        return httpx.Response(200, json={"data": []})

    _patch_client(monkeypatch, httpx.MockTransport(handler))
    backend = llm_backends.OpenAICompatBackend("http://localhost:8000", api_key="sk-test")

    asyncio.run(backend.list_models())

    assert seen_headers.get("authorization") == "Bearer sk-test"


def test_get_backend_returns_ollama_backend():
    backend = llm_backends.get_backend("ollama", "http://localhost:11434", None)
    assert isinstance(backend, llm_backends.OllamaBackend)


def test_get_backend_returns_openai_compat_for_lmstudio_and_vllm():
    lmstudio = llm_backends.get_backend("lmstudio", "http://localhost:1234", None)
    vllm = llm_backends.get_backend("vllm", "http://localhost:8000", None)
    assert isinstance(lmstudio, llm_backends.OpenAICompatBackend)
    assert isinstance(vllm, llm_backends.OpenAICompatBackend)


def test_get_backend_raises_on_unknown_type():
    with pytest.raises(ValueError):
        llm_backends.get_backend("unknown", "http://localhost:1", None)
