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


PREFERRED_PORT = 47821  # fixed so the web origin (and its localStorage) is stable across launches


def _free_port() -> int:
    for port in (PREFERRED_PORT, 0):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue
            return s.getsockname()[1]
    raise RuntimeError("no free port")


def main() -> None:
    root = _resource_dir()
    support_dir = Path.home() / "Library" / "Application Support" / "ConvertToMD"
    os.environ.setdefault("CONVERTTOMD_CONFIG_DIR", str(support_dir))
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
    webview.start(private_mode=False, storage_path=str(support_dir / "webview"))
    server.should_exit = True


if __name__ == "__main__":
    main()
