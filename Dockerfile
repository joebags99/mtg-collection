# --- Stage 1: Build React frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY public ./public
COPY src ./src
COPY tailwind.config.js ./
ARG REACT_APP_API_URL=""
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

# --- Stage 2: Python backend + static files ---
FROM python:3.12-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-build /app/build ./static

# Serve static files from FastAPI
RUN echo '\n\
from fastapi.staticfiles import StaticFiles\n\
from fastapi.responses import FileResponse\n\
import os\n\
\n\
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")\n\
if os.path.exists(static_dir):\n\
    from backend.app import app\n\
    @app.get("/")\n\
    async def serve_root():\n\
        return FileResponse(os.path.join(static_dir, "index.html"))\n\
    app.mount("/static", StaticFiles(directory=os.path.join(static_dir, "static")), name="static-files")\n\
    @app.get("/{full_path:path}")\n\
    async def serve_spa(full_path: str):\n\
        file_path = os.path.join(static_dir, full_path)\n\
        if os.path.isfile(file_path):\n\
            return FileResponse(file_path)\n\
        return FileResponse(os.path.join(static_dir, "index.html"))\n\
' > serve.py

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
