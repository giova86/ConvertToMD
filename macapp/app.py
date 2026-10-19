"""ConvertToMD desktop launcher: FastAPI backend + built frontend in a native window."""
import os
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path


def _resource_dir() -> Path:
    # PyInstaller unpacks data under sys._MEIPASS; in dev use the repo root.
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    root = _resource_dir()
    os.environ.setdefault(
        "CONVERTTOMD_CONFIG_DIR",
        str(Path.home() / "Library" / "Application Support" / "ConvertToMD"),
    )
    os.environ.setdefault("CONVERTTOMD_FRONTEND_DIST", str(root / "frontend_dist"))
    sys.path.insert(0, str(root / "backend"))

    import uvicorn
    import webview

    from main import app  # backend/main.py

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    threading.Thread(target=server.run, daemon=True).start()

    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=0.5)
            break
        except Exception:
            time.sleep(0.1)

    webview.settings["ALLOW_DOWNLOADS"] = True
    webview.create_window("ConvertToMD", url, width=1400, height=900, min_size=(900, 600))
    webview.start()
    server.should_exit = True


if __name__ == "__main__":
    main()
