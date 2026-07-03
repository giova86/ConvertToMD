from typing import Protocol

import httpx


class BackendConnectionError(Exception):
    """Raised when the configured LLM server cannot be reached."""


class BackendResponseError(Exception):
    """Raised when the configured LLM server returns a non-2xx response."""


class Backend(Protocol):
    async def list_models(self) -> list[str]: ...
    async def ocr_image(self, image_b64: str, prompt: str, model: str) -> str: ...


def _auth_headers(api_key: str | None) -> dict:
    return {"Authorization": f"Bearer {api_key}"} if api_key else {}


class OllamaBackend:
    def __init__(self, base_url: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(f"{self.base_url}/api/tags", headers=_auth_headers(self.api_key))
            except httpx.ConnectError as e:
                raise BackendConnectionError(str(e)) from e
        if resp.status_code >= 400:
            raise BackendResponseError(f"status {resp.status_code}")
        return [m["name"] for m in resp.json().get("models", [])]

    async def ocr_image(self, image_b64: str, prompt: str, model: str) -> str:
        payload = {"model": model, "prompt": prompt, "images": [image_b64], "stream": False}
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/api/generate", json=payload, headers=_auth_headers(self.api_key)
                )
            except httpx.ConnectError as e:
                raise BackendConnectionError(str(e)) from e
        if resp.status_code >= 400:
            raise BackendResponseError(f"status {resp.status_code}")
        return resp.json().get("response", "").strip()


class OpenAICompatBackend:
    """Used for both LM Studio and vLLM — both speak the OpenAI chat-completions API."""

    def __init__(self, base_url: str, api_key: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(f"{self.base_url}/v1/models", headers=_auth_headers(self.api_key))
            except httpx.ConnectError as e:
                raise BackendConnectionError(str(e)) from e
        if resp.status_code >= 400:
            raise BackendResponseError(f"status {resp.status_code}")
        return [m["id"] for m in resp.json().get("data", [])]

    async def ocr_image(self, image_b64: str, prompt: str, model: str) -> str:
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                    ],
                }
            ],
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/v1/chat/completions", json=payload, headers=_auth_headers(self.api_key)
                )
            except httpx.ConnectError as e:
                raise BackendConnectionError(str(e)) from e
        if resp.status_code >= 400:
            raise BackendResponseError(f"status {resp.status_code}")
        return resp.json()["choices"][0]["message"]["content"].strip()


def get_backend(backend_type: str, base_url: str, api_key: str | None = None) -> Backend:
    if backend_type == "ollama":
        return OllamaBackend(base_url, api_key)
    if backend_type in ("lmstudio", "vllm"):
        return OpenAICompatBackend(base_url, api_key)
    raise ValueError(f"Unknown backend_type: {backend_type}")
