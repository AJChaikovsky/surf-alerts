# -------- 1. Build the React app --------
FROM node:24-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# -------- 2. Run FastAPI, serving the built app too --------
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /frontend/dist ./static

# Don't run as root.
RUN useradd --create-home surf
USER surf

EXPOSE 8080

# The website. fly.toml also defines a worker process from this image.
# --proxy-headers so rate limits see visitors' real IPs behind Fly's proxy.
CMD ["uvicorn", "app.server:application", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
