import json

import settings_store


def test_load_settings_defaults_when_missing(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(cfg))

    result = settings_store.load_settings()

    assert result == settings_store.DEFAULT_SETTINGS


def test_save_and_load_round_trip(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(cfg))

    saved = settings_store.save_settings({
        "backend_type": "lmstudio",
        "base_url": "http://localhost:1234",
        "api_key": "secret",
        "default_model": "qwen-vl",
    })

    assert saved["backend_type"] == "lmstudio"
    assert saved["default_model"] == "qwen-vl"

    loaded = settings_store.load_settings()
    assert loaded == saved
    assert json.loads(cfg.read_text())["backend_type"] == "lmstudio"


def test_save_settings_fills_missing_keys_with_defaults(tmp_path, monkeypatch):
    cfg = tmp_path / "config.json"
    monkeypatch.setattr(settings_store, "CONFIG_PATH", str(cfg))

    saved = settings_store.save_settings({"backend_type": "vllm", "base_url": "http://localhost:8000"})

    assert saved["api_key"] is None
    assert saved["default_model"] == settings_store.DEFAULT_SETTINGS["default_model"]
