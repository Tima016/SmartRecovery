# ═══════════════════════════════════════════════════════════
# IDFR Platform — Backend Dockerfile
# Node 20 Alpine + Express (production)
# ═══════════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --silent

COPY . .
RUN npm run build

# Verify compiled output exists
RUN test -d dist || (echo "ERROR: dist/ not found after tsc build" && exit 1)

# ── Stage 2: Production runner ─────────────────────────────
FROM node:20-alpine AS runner

# Never run as root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder --chown=appuser:appgroup /app/package.json  ./package.json
COPY --from=builder --chown=appuser:appgroup /app/node_modules  ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist          ./dist

USER appuser

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
