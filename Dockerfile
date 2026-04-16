# ---- Build stage ----
FROM node:22-slim AS builder

WORKDIR /app

# Build tools required to compile better-sqlite3 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for layer caching
COPY lib/backend/package.json lib/backend/yarn.lock ./lib/backend/
COPY lib/frontend/package.json lib/frontend/yarn.lock ./lib/frontend/

RUN yarn --cwd lib/backend install --frozen-lockfile \
    && yarn --cwd lib/frontend install --frozen-lockfile

# Copy source
COPY lib/backend/src ./lib/backend/src
COPY lib/frontend/src ./lib/frontend/src
COPY lib/frontend/index.html lib/frontend/vite.config.js ./lib/frontend/

RUN yarn --cwd lib/frontend build

# ---- Production stage ----
FROM node:22-slim

WORKDIR /app

# Install Tesseract CLI with German and English language packs
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled backend deps (includes native better-sqlite3 binary)
COPY --from=builder /app/lib/backend/node_modules ./lib/backend/node_modules
COPY --from=builder /app/lib/backend/src ./lib/backend/src
COPY --from=builder /app/lib/frontend/dist ./lib/frontend/dist
COPY lib/backend/package.json ./lib/backend/
COPY package.json ./

RUN mkdir -p /data

ENV NODE_ENV=production \
    OCR_BACKEND=cli \
    PORT=3000 \
    DB_PATH=/data/nanosearch.db

EXPOSE 3000
VOLUME /data

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

CMD ["node", "lib/backend/src/server.js"]
