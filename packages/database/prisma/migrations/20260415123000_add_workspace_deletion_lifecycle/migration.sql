-- Add minimal lifecycle metadata for workspace deletion requests.
ALTER TABLE "Organization"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
ADD COLUMN "deletionRequestedById" TEXT,
ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);

CREATE INDEX "Organization_archivedAt_idx" ON "Organization"("archivedAt");
CREATE INDEX "Organization_deletionScheduledFor_idx" ON "Organization"("deletionScheduledFor");
CREATE INDEX "Organization_deletionRequestedById_idx" ON "Organization"("deletionRequestedById");
