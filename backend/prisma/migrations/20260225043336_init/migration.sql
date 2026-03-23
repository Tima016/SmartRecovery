-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'INVESTIGATOR', 'ANALYST', 'AUDITOR');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVIEW', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseClassification" AS ENUM ('UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'PROCESSING', 'VERIFIED', 'CORRUPTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ImagingStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('BROWSER_HISTORY', 'USB_LOG', 'REGISTRY_HIVE', 'EVENT_LOG', 'PREFETCH', 'SHELLBAG', 'NETWORK_CAPTURE');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('FILE', 'NETWORK', 'USB', 'REGISTRY', 'PROCESS', 'AUTHENTICATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTER', 'USER_LOGIN', 'USER_LOGOUT', 'USER_FAILED_LOGIN', 'USER_2FA_ENABLE', 'USER_2FA_VERIFY', 'USER_PASSWORD_CHANGE', 'CASE_CREATE', 'CASE_UPDATE', 'CASE_CLOSE', 'CASE_ASSIGN', 'EVIDENCE_UPLOAD', 'EVIDENCE_VERIFY', 'EVIDENCE_DOWNLOAD', 'EVIDENCE_DELETE', 'CUSTODY_RECORD', 'IMAGING_START', 'IMAGING_PAUSE', 'IMAGING_RESUME', 'IMAGING_COMPLETE', 'IMAGING_FAIL', 'ARTIFACT_EXTRACT', 'REPORT_GENERATE', 'TIMELINE_VIEW', 'SYSTEM_CONFIG_CHANGE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "refreshTokenHash" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "classification" "CaseClassification" NOT NULL DEFAULT 'UNCLASSIFIED',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_members" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['READ']::TEXT[],
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "description" TEXT,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "ivHex" TEXT NOT NULL,
    "authTagHex" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "sha1" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sha512" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_of_custody" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT,
    "recordHash" TEXT NOT NULL,
    "signature" TEXT,
    "signerCert" TEXT,

    CONSTRAINT "chain_of_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_jobs" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sourceDrive" TEXT NOT NULL,
    "sourceSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "imageFormat" TEXT NOT NULL DEFAULT 'E01',
    "outputBucket" TEXT,
    "outputKey" TEXT,
    "status" "ImagingStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferredBytes" BIGINT NOT NULL DEFAULT 0,
    "badSectors" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "resumeOffset" BIGINT NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "queueJobId" TEXT,
    "workerId" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imaging_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "type" "ArtifactType" NOT NULL,
    "source" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "extractedById" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actor" TEXT,
    "targetObject" TEXT,
    "metadata" JSONB,
    "correlationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "artifactId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "prevHash" TEXT,
    "recordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_priority_idx" ON "cases"("priority");

-- CreateIndex
CREATE INDEX "cases_createdById_idx" ON "cases"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "case_members_caseId_userId_key" ON "case_members"("caseId", "userId");

-- CreateIndex
CREATE INDEX "evidence_caseId_idx" ON "evidence"("caseId");

-- CreateIndex
CREATE INDEX "evidence_status_idx" ON "evidence"("status");

-- CreateIndex
CREATE INDEX "evidence_sha256_idx" ON "evidence"("sha256");

-- CreateIndex
CREATE INDEX "chain_of_custody_evidenceId_idx" ON "chain_of_custody"("evidenceId");

-- CreateIndex
CREATE INDEX "imaging_jobs_caseId_idx" ON "imaging_jobs"("caseId");

-- CreateIndex
CREATE INDEX "imaging_jobs_status_idx" ON "imaging_jobs"("status");

-- CreateIndex
CREATE INDEX "artifacts_caseId_idx" ON "artifacts"("caseId");

-- CreateIndex
CREATE INDEX "artifacts_type_idx" ON "artifacts"("type");

-- CreateIndex
CREATE INDEX "timeline_events_caseId_idx" ON "timeline_events"("caseId");

-- CreateIndex
CREATE INDEX "timeline_events_type_idx" ON "timeline_events"("type");

-- CreateIndex
CREATE INDEX "timeline_events_timestamp_idx" ON "timeline_events"("timestamp");

-- CreateIndex
CREATE INDEX "reports_caseId_idx" ON "reports"("caseId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_members" ADD CONSTRAINT "case_members_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_members" ADD CONSTRAINT "case_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_of_custody" ADD CONSTRAINT "chain_of_custody_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_of_custody" ADD CONSTRAINT "chain_of_custody_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_jobs" ADD CONSTRAINT "imaging_jobs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_jobs" ADD CONSTRAINT "imaging_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_extractedById_fkey" FOREIGN KEY ("extractedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
