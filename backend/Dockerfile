# ─── Stage 1: Build ─────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN apt-get update && apt-get install -y openssl build-essential python3

RUN npm install --legacy-peer-deps

COPY . .

RUN npx prisma generate
RUN npm run build


# ─── Stage 2: Production ─────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl wget

RUN addgroup --system dfip && adduser --system --ingroup dfip dfip

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

RUN mkdir -p /tmp/dfip-uploads && chown -R dfip:dfip /app /tmp/dfip-uploads

USER dfip

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]