-- CreateEnum
CREATE TYPE "RecoveryMethod" AS ENUM ('METADATA', 'CARVING', 'FRAGMENT_LINK');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FragmentStatus" AS ENUM ('UNLINKED', 'LINKED', 'ORPHAN');

-- CreateTable
CREATE TABLE "recovered_files" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "method" "RecoveryMethod" NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "offsetStart" BIGINT NOT NULL DEFAULT 0,
    "offsetEnd" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "md5" TEXT,
    "entropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "headerSignature" TEXT,
    "footerSignature" TEXT,
    "headerMatchScore" INTEGER NOT NULL DEFAULT 0,
    "footerMatchScore" INTEGER NOT NULL DEFAULT 0,
    "entropyRangeScore" INTEGER NOT NULL DEFAULT 0,
    "metadataScore" INTEGER NOT NULL DEFAULT 0,
    "hasValidHeader" BOOLEAN NOT NULL DEFAULT false,
    "hasValidFooter" BOOLEAN NOT NULL DEFAULT false,
    "footerDistanceOk" BOOLEAN NOT NULL DEFAULT false,
    "byteContinuityOk" BOOLEAN NOT NULL DEFAULT false,
    "algorithmVersion" TEXT,
    "scoringModelVersion" TEXT,
    "evidenceHash" TEXT,
    "storageBucket" TEXT,
    "storageKey" TEXT,
    "fragmentGroup" TEXT,
    "recoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovered_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragments" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "offsetStart" BIGINT NOT NULL,
    "offsetEnd" BIGINT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "entropyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "byteContinuity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "headerHint" TEXT,
    "status" "FragmentStatus" NOT NULL DEFAULT 'UNLINKED',
    "linkProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fragmentGroup" TEXT,
    "recoveredFileId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fragments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correlations" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temporalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actorScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diversityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correlations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_versions" (
    "id" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "scoringModelVersion" TEXT NOT NULL,
    "fragmentLinkerVersion" TEXT NOT NULL,
    "correlationEngineVersion" TEXT NOT NULL,
    "commitHash" TEXT,
    "buildNumber" TEXT,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "system_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovered_files_caseId_idx" ON "recovered_files"("caseId");

-- CreateIndex
CREATE INDEX "recovered_files_method_idx" ON "recovered_files"("method");

-- CreateIndex
CREATE INDEX "recovered_files_confidence_idx" ON "recovered_files"("confidence");

-- CreateIndex
CREATE INDEX "recovered_files_evidenceId_idx" ON "recovered_files"("evidenceId");

-- CreateIndex
CREATE INDEX "recovered_files_caseId_method_idx" ON "recovered_files"("caseId", "method");

-- CreateIndex
CREATE INDEX "recovered_files_caseId_confidence_idx" ON "recovered_files"("caseId", "confidence");

-- CreateIndex
CREATE INDEX "fragments_caseId_idx" ON "fragments"("caseId");

-- CreateIndex
CREATE INDEX "fragments_fragmentGroup_idx" ON "fragments"("fragmentGroup");

-- CreateIndex
CREATE INDEX "fragments_entropyScore_idx" ON "fragments"("entropyScore");

-- CreateIndex
CREATE INDEX "fragments_caseId_offsetStart_idx" ON "fragments"("caseId", "offsetStart");

-- CreateIndex
CREATE INDEX "correlations_caseId_idx" ON "correlations"("caseId");

-- CreateIndex
CREATE INDEX "correlations_weight_idx" ON "correlations"("weight");

-- CreateIndex
CREATE INDEX "correlations_caseId_weight_idx" ON "correlations"("caseId", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "correlations_caseId_sourceId_targetId_key" ON "correlations"("caseId", "sourceId", "targetId");

-- AddForeignKey
ALTER TABLE "recovered_files" ADD CONSTRAINT "recovered_files_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovered_files" ADD CONSTRAINT "recovered_files_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fragments" ADD CONSTRAINT "fragments_recoveredFileId_fkey" FOREIGN KEY ("recoveredFileId") REFERENCES "recovered_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correlations" ADD CONSTRAINT "correlations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
