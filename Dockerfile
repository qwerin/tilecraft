# ── Stage 1: frontend ────────────────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ── Stage 2: Go binary (pure Go, no CGO) ─────────────────────────────────────
FROM golang:1.26-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /tilecraft ./cmd/server/ \
 && mkdir -p /data

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=go-builder /tilecraft /app/tilecraft
COPY --from=frontend-builder /app/web/dist /app/dist
# fotky zakázek a logo; nonroot uživatel musí mít zápis — připojte volume
COPY --from=go-builder --chown=65532:65532 /data /data

ENV TILECRAFT_STATIC_DIR=/app/dist \
    TILECRAFT_LISTEN_ADDR=:8080 \
    TILECRAFT_DATA_DIR=/data

VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/app/tilecraft"]
