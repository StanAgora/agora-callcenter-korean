# ── Stage 1: Build React/Vite frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH

COPY frontend/package*.json ./
RUN npm ci --prefer-offline

# CACHEBUST invalidates the layer cache for this and every subsequent COPY/RUN
# below, so a new commit always rebuilds even if BuildKit misjudges file diffs.
ARG CACHEBUST=1
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Runtime (FastAPI + nginx via supervisor) ────────────────────────
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
ARG CACHEBUST=1
COPY backend/ ./

# Built frontend static files
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html/

# nginx + supervisor config
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/supervisord.conf /etc/supervisor/conf.d/app.conf

RUN mkdir -p /var/log/supervisor /var/log/nginx /run/nginx

EXPOSE 8080

CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/app.conf"]
