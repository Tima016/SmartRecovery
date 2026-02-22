# ═══════════════════════════════════════════════════
# Stage 1: Build
# ═══════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifest files explicitly — no glob wildcard.
# npm ci requires package-lock.json to exist; failing
# here is intentional and catches missing lockfiles early.
COPY package.json package-lock.json ./

# Install all deps (including devDeps needed for build)
RUN npm ci --silent

# Copy source — .env is excluded via .dockerignore
COPY . .

# Vite build (NODE_ENV is set automatically by Vite to "production")
RUN npm run build

# Verify dist exists (fails fast if build produced nothing)
RUN test -d dist || (echo "ERROR: dist/ not found after build" && exit 1)

# ═══════════════════════════════════════════════════
# Stage 2: Serve with nginx
# ═══════════════════════════════════════════════════
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy built dist from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Drop privileges
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
