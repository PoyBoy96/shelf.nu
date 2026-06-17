-- CreateEnum
CREATE TYPE "DeletedItemType" AS ENUM ('ASSET', 'KIT', 'BOOKING');

-- CreateEnum
CREATE TYPE "DeletionReason" AS ENUM ('BROKEN', 'MISSING', 'REPLACED', 'OTHER');

-- CreateTable
CREATE TABLE "DeletedItemRecord" (
    "id" TEXT NOT NULL,
    "itemType" "DeletedItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "sequentialId" TEXT,
    "reason" "DeletionReason",
    "reasonNote" TEXT,
    "snapshot" JSONB,
    "deletedById" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedItemRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeletedItemRecord_organizationId_createdAt_idx" ON "DeletedItemRecord"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DeletedItemRecord_organizationId_itemType_idx" ON "DeletedItemRecord"("organizationId", "itemType");

-- CreateIndex
CREATE INDEX "DeletedItemRecord_deletedById_idx" ON "DeletedItemRecord"("deletedById");

-- AddForeignKey
ALTER TABLE "DeletedItemRecord" ADD CONSTRAINT "DeletedItemRecord_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedItemRecord" ADD CONSTRAINT "DeletedItemRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeletedItemRecord" ENABLE row level security;
