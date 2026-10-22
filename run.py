"""One-command launcher for MTG Commander Recommender.

    python run.py           Build the frontend if needed and serve the whole app at http://localhost:8000
    python run.py --dev     Hot-reloading dev servers (frontend :3000, backend :8000)

Missing Python packages and node_modules are installed on first run.
Settings from a .env file in this folder (JWT_SECRET, DATABASE_PATH, ...) are applied.
"""
import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(ROOT, "build")
# Inputs that require a frontend rebuild when they change
FRONTEND_SOURCES = ["src", "public", "package.json", "tailwind.config.js"]
# Import names of the backend's requirements, to detect a missing install
REQUIRED_MODULES = ["fastapi", "uvicorn", "pyedhrec", "multipart", "requests", "slowapi", "bcrypt", "jwt"]


def log(msg):
    print(f"[run] {msg}", flush=True)


def load_env_file():
    """Apply KEY=VALUE lines from .env without overriding variables already set."""
    path = os.path.join(ROOT, ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if value:
                os.environ.setdefault(key.strip(), value)


def choose_database_path():
    """Keep using an existing database. The server used to resolve it relative to the
    folder it was started from, so it may live in the project root or in backend/."""
    if os.environ.get("DATABASE_PATH"):
        return
    candidates = [os.path.join(ROOT, "mtg_collection.db"), os.path.join(ROOT, "backend", "mtg_collection.db")]
    existing = next((p for p in candidates if os.path.isfile(p)), candidates[0])
    os.environ["DATABASE_PATH"] = existing


def ensure_python_deps():
    missing = [m for m in REQUIRED_MODULES if importlib.util.find_spec(m) is None]
    if not missing:
        return
    log(f"Installing Python packages (missing: {', '.join(missing)})...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", os.path.join(ROOT, "backend", "requirements.txt")])


def npm_command():
    npm = shutil.which("npm")
    if not npm:
        sys.exit("[run] npm was not found. Install Node.js from https://nodejs.org and try again.")
    return npm


def ensure_node_modules(npm):
    if os.path.isdir(os.path.join(ROOT, "node_modules")):
        return
    log("Installing frontend packages (first run only)...")
    subprocess.check_call([npm, "install"], cwd=ROOT)


def newest_mtime(paths):
    newest = 0.0
    for rel in paths:
        path = os.path.join(ROOT, rel)
        if os.path.isfile(path):
            newest = max(newest, os.path.getmtime(path))
        for dirpath, _, filenames in os.walk(path):
            for name in filenames:
                newest = max(newest, os.path.getmtime(os.path.join(dirpath, name)))
    return newest


def ensure_frontend_build(npm):
    index = os.path.join(BUILD_DIR, "index.html")
    if os.path.isfile(index) and os.path.getmtime(index) >= newest_mtime(FRONTEND_SOURCES):
        return
    log("Building the frontend (takes a minute when the code has changed)...")
    env = {**os.environ, "REACT_APP_API_URL": ""}  # same-origin API calls
    subprocess.check_call([npm, "run", "build"], cwd=ROOT, env=env)


def open_browser_when_ready(url):
    def wait_and_open():
        for _ in range(60):
            try:
                urllib.request.urlopen(url + "/api/health", timeout=1)
                webbrowser.open(url)
                return
            except Exception:
                time.sleep(0.5)
    threading.Thread(target=wait_and_open, daemon=True).start()


def run_app(port, open_browser):
    npm = npm_command()
    ensure_node_modules(npm)
    ensure_frontend_build(npm)
    os.environ["STATIC_DIR"] = BUILD_DIR

    import uvicorn
    url = f"http://localhost:{port}"
    log(f"Starting at {url} (press Ctrl+C to stop)")
    if open_browser:
        open_browser_when_ready(url)
    uvicorn.run("backend.serve:app", host="127.0.0.1", port=port)


def run_dev(port, open_browser):
    npm = npm_command()
    ensure_node_modules(npm)
    log("Dev mode: backend on :%d (auto-reload), frontend on :3000 (hot reload)" % port)
    env = {**os.environ, "BROWSER": "default" if open_browser else "none",
           "REACT_APP_API_URL": f"http://localhost:{port}"}
    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app:app", "--reload", "--reload-dir", "backend", "--port", str(port)],
        cwd=ROOT,
    )
    frontend = subprocess.Popen([npm, "start"], cwd=ROOT, env=env)
    try:
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for proc in (frontend, backend):
            if proc.poll() is None:
                proc.terminate()
        for proc in (frontend, backend):
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


def main():
    parser = argparse.ArgumentParser(description="Start MTG Commander Recommender.")
    parser.add_argument("--dev", action="store_true", help="run hot-reloading dev servers instead")
    parser.add_argument("--port", type=int, default=8000, help="backend port (default 8000)")
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = parser.parse_args()

    os.chdir(ROOT)
    sys.path.insert(0, ROOT)
    load_env_file()
    choose_database_path()
    ensure_python_deps()
    log(f"Database: {os.environ['DATABASE_PATH']}")

    try:
        if args.dev:
            run_dev(args.port, not args.no_browser)
        else:
            run_app(args.port, not args.no_browser)
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as e:
        sys.exit(f"[run] Step failed: {' '.join(map(str, e.cmd))}")


if __name__ == "__main__":
    main()
