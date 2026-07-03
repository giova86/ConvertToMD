import json
import os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

DEFAULT_SETTINGS = {
    "backend_type": "ollama",
    "base_url": "http://localhost:11434",
    "api_key": None,
    "default_model": "glm-ocr:latest",
}


def load_settings() -> dict:
    if not os.path.exists(CONFIG_PATH):
        return dict(DEFAULT_SETTINGS)
    with open(CONFIG_PATH, "r") as f:
        data = json.load(f)
    return {**DEFAULT_SETTINGS, **data}


def save_settings(settings: dict) -> dict:
    merged = {**DEFAULT_SETTINGS, **settings}
    with open(CONFIG_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    return merged
