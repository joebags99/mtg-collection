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

EXPOSE 8000

# backend.serve wraps the API and also serves the built frontend from ./static
CMD ["python", "-m", "uvicorn", "backend.serve:app", "--host", "0.0.0.0", "--port", "8000"]
