"""Production entrypoint: the API from backend.app plus the built React frontend.

Run with: uvicorn backend.serve:app
"""
import os

from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app import app

STATIC_DIR = os.path.realpath(
    os.environ.get("STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))
)
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

if os.path.isfile(INDEX_FILE):
    app.mount("/static", StaticFiles(directory=os.path.join(STATIC_DIR, "static")), name="static-files")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve files from the build (favicon, mana SVGs, ...) and fall back to index.html."""
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = os.path.realpath(os.path.join(STATIC_DIR, full_path))
        if file_path.startswith(STATIC_DIR + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(INDEX_FILE)
