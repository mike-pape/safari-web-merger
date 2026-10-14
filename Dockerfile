
# Stage 1: Deno JavaScript runtime
FROM denoland/deno:bin-2.5.6 AS deno

# Stage 2: Build Safari Media Grabber website
FROM node:22-alpine AS web

WORKDIR /site

COPY package.json ./

RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build

# Stage 3: Python backend
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install FFmpeg and system certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy Deno runtime
COPY --from=deno /deno /usr/local/bin/deno

# Install yt-dlp, EJS support, and API dependencies
RUN python -m pip install --no-cache-dir --upgrade \
    "yt-dlp[default]" \
    "fastapi>=0.115,<1" \
    "uvicorn>=0.30,<1"

# Verify tools are available
RUN python -m yt_dlp --version && \
    deno --version && \
    ffmpeg -version

# Verify the yt-dlp EJS package is installed
RUN python -m pip show yt-dlp-ejs

# Copy compiled website
COPY --from=web /site/dist /app/dist

# Copy Python backend
COPY backend /app/backend

# Render service port
EXPOSE 10000

# Launch Safari Media Grabber
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-10000}"]
