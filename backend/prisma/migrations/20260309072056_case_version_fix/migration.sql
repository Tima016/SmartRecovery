/*
  Warnings:

  - The values [DRAFT,ACTIVE,REVIEW] on the enum `CaseStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('IMAGING', 'HASHING', 'ARTIFACT_EXTRACTION', 'FILE_CARVING');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('FILE', 'ARTIFACT', 'TIMELINE', 'EVIDENCE', 'CASE');

-- AlterEnum
BEGIN;
CREATE TYPE "CaseStatus_new" AS ENUM ('CREATED', 'IMAGING', 'HASHING', 'SCANNING', 'ANALYZING', 'READY', 'ERROR', 'CLOSED', 'ARCHIVED');
ALTER TABLE "cases" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "cases" ALTER COLUMN "status" TYPE "CaseStatus_new" USING ("status"::text::"CaseStatus_new");
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
DROP TYPE "CaseStatus_old";
ALTER TABLE "cases" ALTER COLUMN "status" SET DEFAULT 'CREATED';
COMMIT;

-- AlterEnum
ALTER TYPE "EvidenceStatus" ADD VALUE 'INTEGRITY_VIOLATION';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "caseId" TEXT,
ADD COLUMN     "evidenceId" TEXT;

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "imaging_jobs" ADD COLUMN     "hashMd5" TEXT,
ADD COLUMN     "hashSha1" TEXT,
ADD COLUMN     "hashSha256" TEXT,
ADD COLUMN     "hashSha512" TEXT;

-- AlterTable
ALTER TABLE "timeline_events" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "processing_tasks" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filesystem_entries" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDirectory" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3),
    "modifiedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3),
    "mftChangedAt" TIMESTAMP(3),
    "parentPath" TEXT NOT NULL,
    "permissions" TEXT,
    "uid" INTEGER,
    "gid" INTEGER,
    "inode" INTEGER,
    "fileType" TEXT,
    "fsType" TEXT NOT NULL,
    "attributes" JSONB,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filesystem_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disk_image_info" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "imageFormat" TEXT NOT NULL,
    "totalSizeBytes" BIGINT NOT NULL,
    "sectorSize" INTEGER NOT NULL DEFAULT 512,
    "totalSectors" BIGINT NOT NULL,
    "partitionScheme" TEXT NOT NULL,
    "partitions" JSONB NOT NULL,
    "fileSystemType" TEXT,
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "deletedFiles" INTEGER NOT NULL DEFAULT 0,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disk_image_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_relations" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspicious_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "relatedEventIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suspicious_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_clusters" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "eventTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_tasks_caseId_idx" ON "processing_tasks"("caseId");

-- CreateIndex
CREATE INDEX "processing_tasks_status_idx" ON "processing_tasks"("status");

-- CreateIndex
CREATE INDEX "filesystem_entries_caseId_idx" ON "filesystem_entries"("caseId");

-- CreateIndex
CREATE INDEX "filesystem_entries_evidenceId_idx" ON "filesystem_entries"("evidenceId");

-- CreateIndex
CREATE INDEX "filesystem_entries_isDeleted_idx" ON "filesystem_entries"("isDeleted");

-- CreateIndex
CREATE INDEX "filesystem_entries_name_idx" ON "filesystem_entries"("name");

-- CreateIndex
CREATE INDEX "filesystem_entries_sizeBytes_idx" ON "filesystem_entries"("sizeBytes");

-- CreateIndex
CREATE INDEX "filesystem_entries_caseId_isDeleted_idx" ON "filesystem_entries"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "filesystem_entries_caseId_name_idx" ON "filesystem_entries"("caseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "disk_image_info_evidenceId_key" ON "disk_image_info"("evidenceId");

-- CreateIndex
CREATE INDEX "tags_caseId_idx" ON "tags"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_caseId_name_key" ON "tags"("caseId", "name");

-- CreateIndex
CREATE INDEX "tag_relations_entityType_entityId_idx" ON "tag_relations"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "tag_relations_tagId_entityType_entityId_key" ON "tag_relations"("tagId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "notes_entityType_entityId_idx" ON "notes"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_userId_entityType_entityId_key" ON "bookmarks"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "suspicious_events_caseId_idx" ON "suspicious_events"("caseId");

-- CreateIndex
CREATE INDEX "suspicious_events_severity_idx" ON "suspicious_events"("severity");

-- CreateIndex
CREATE INDEX "timeline_clusters_caseId_idx" ON "timeline_clusters"("caseId");

-- CreateIndex
CREATE INDEX "timeline_clusters_severity_idx" ON "timeline_clusters"("severity");

-- AddForeignKey
ALTER TABLE "processing_tasks" ADD CONSTRAINT "processing_tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_relations" ADD CONSTRAINT "tag_relations_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_relations" ADD CONSTRAINT "tag_relations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspicious_events" ADD CONSTRAINT "suspicious_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_clusters" ADD CONSTRAINT "timeline_clusters_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
