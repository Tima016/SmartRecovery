#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# DFIP Backup Script
# Creates timestamped backups of PostgreSQL, Redis, and MinIO
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

# Docker Compose project name
COMPOSE_PROJECT="${COMPOSE_PROJECT:-dfip-platform}"

echo "══════════════════════════════════════════"
echo "  DFIP Backup — ${TIMESTAMP}"
echo "══════════════════════════════════════════"

mkdir -p "${BACKUP_PATH}"

# ─── 1. PostgreSQL Backup ──────────────────────────────────────
echo "[1/3] Backing up PostgreSQL..."
docker compose exec -T db pg_dump \
    -U "${POSTGRES_USER:-dfip}" \
    -d "${POSTGRES_DB:-dfip}" \
    --format=custom \
    --compress=9 \
    > "${BACKUP_PATH}/postgres.dump"
echo "  → PostgreSQL backup: ${BACKUP_PATH}/postgres.dump ($(du -h "${BACKUP_PATH}/postgres.dump" | cut -f1))"

# ─── 2. Redis Snapshot ─────────────────────────────────────────
echo "[2/3] Backing up Redis..."
docker compose exec -T redis redis-cli \
    --pass "${REDIS_PASSWORD:-changeme}" \
    BGSAVE >/dev/null 2>&1 || true

# Wait for background save to complete
sleep 2

docker compose cp redis:/data/appendonly.aof "${BACKUP_PATH}/redis-appendonly.aof" 2>/dev/null || true
docker compose cp redis:/data/dump.rdb "${BACKUP_PATH}/redis-dump.rdb" 2>/dev/null || true
echo "  → Redis backup: ${BACKUP_PATH}/redis-*.{rdb,aof}"

# ─── 3. MinIO Evidence Backup ──────────────────────────────────
echo "[3/3] Backing up MinIO evidence..."
docker compose exec -T minio sh -c \
    "cd /data && tar czf - ." \
    > "${BACKUP_PATH}/minio-data.tar.gz"
echo "  → MinIO backup: ${BACKUP_PATH}/minio-data.tar.gz ($(du -h "${BACKUP_PATH}/minio-data.tar.gz" | cut -f1))"

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo "  Backup completed: ${BACKUP_PATH}"
echo "  Total size: $(du -sh "${BACKUP_PATH}" | cut -f1)"
echo "══════════════════════════════════════════"

# ─── Cleanup old backups (keep last 7) ─────────────────────────
KEEP_COUNT="${BACKUP_KEEP_COUNT:-7}"
cd "${BACKUP_DIR}"
ls -1dt */ 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -rf
echo "  Retained last ${KEEP_COUNT} backups"
