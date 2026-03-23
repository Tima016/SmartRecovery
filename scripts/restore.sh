#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# DFIP Restore Script
# Restores PostgreSQL, Redis, and MinIO from a backup directory
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_PATH="${1:-}"

if [ -z "$BACKUP_PATH" ]; then
    echo "Usage: $0 <backup-directory>"
    echo "Example: $0 ./backups/20260308_120000"
    exit 1
fi

if [ ! -d "$BACKUP_PATH" ]; then
    echo "ERROR: Backup directory not found: $BACKUP_PATH"
    exit 1
fi

echo "══════════════════════════════════════════"
echo "  DFIP Restore from: ${BACKUP_PATH}"
echo "══════════════════════════════════════════"
echo ""
echo "⚠  WARNING: This will OVERWRITE current data!"
read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ─── 1. Restore PostgreSQL ─────────────────────────────────────
if [ -f "${BACKUP_PATH}/postgres.dump" ]; then
    echo "[1/3] Restoring PostgreSQL..."
    # Drop and recreate database
    docker compose exec -T db psql \
        -U "${POSTGRES_USER:-dfip}" \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB:-dfip}' AND pid <> pg_backend_pid();" \
        postgres >/dev/null 2>&1 || true

    docker compose exec -T db dropdb \
        -U "${POSTGRES_USER:-dfip}" \
        --if-exists "${POSTGRES_DB:-dfip}" 2>/dev/null || true

    docker compose exec -T db createdb \
        -U "${POSTGRES_USER:-dfip}" \
        "${POSTGRES_DB:-dfip}" 2>/dev/null || true

    cat "${BACKUP_PATH}/postgres.dump" | docker compose exec -T db pg_restore \
        -U "${POSTGRES_USER:-dfip}" \
        -d "${POSTGRES_DB:-dfip}" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists 2>/dev/null || true

    echo "  → PostgreSQL restored"
else
    echo "[1/3] SKIP: postgres.dump not found"
fi

# ─── 2. Restore Redis ──────────────────────────────────────────
if [ -f "${BACKUP_PATH}/redis-dump.rdb" ]; then
    echo "[2/3] Restoring Redis..."
    docker compose stop redis
    docker compose cp "${BACKUP_PATH}/redis-dump.rdb" redis:/data/dump.rdb
    if [ -f "${BACKUP_PATH}/redis-appendonly.aof" ]; then
        docker compose cp "${BACKUP_PATH}/redis-appendonly.aof" redis:/data/appendonly.aof
    fi
    docker compose start redis
    echo "  → Redis restored"
else
    echo "[2/3] SKIP: redis-dump.rdb not found"
fi

# ─── 3. Restore MinIO ──────────────────────────────────────────
if [ -f "${BACKUP_PATH}/minio-data.tar.gz" ]; then
    echo "[3/3] Restoring MinIO evidence..."
    cat "${BACKUP_PATH}/minio-data.tar.gz" | docker compose exec -T minio sh -c \
        "cd /data && tar xzf -"
    echo "  → MinIO restored"
else
    echo "[3/3] SKIP: minio-data.tar.gz not found"
fi

# ─── Run Prisma migrations ─────────────────────────────────────
echo ""
echo "Running Prisma migrations..."
docker compose exec -T backend npx prisma migrate deploy
echo "  → Migrations applied"

echo ""
echo "══════════════════════════════════════════"
echo "  Restore completed successfully!"
echo "  Restart services: docker compose restart"
echo "══════════════════════════════════════════"
