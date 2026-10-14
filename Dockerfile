FROM denoland/deno:bin-2.5.6 AS deno
FROM node:22-alpine AS web
WORKDIR /site
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
RUN pip install --no-cache-dir 'yt-dlp[default]' 'fastapi>=0.115,<1' 'uvicorn>=0.30,<1'
COPY --from=web /site/dist /app/dist
COPY backend /app/backend
EXPOSE 10000
CMD ["sh","-c","uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-10000}"]
