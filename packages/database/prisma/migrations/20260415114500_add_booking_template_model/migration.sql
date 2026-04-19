-- CreateTable
CREATE TABLE "BookingTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_templates_owner_lookup_idx" ON "BookingTemplate"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_templates_owner_name_unique" ON "BookingTemplate"("organizationId", "ownerId", "name");

-- AddForeignKey
ALTER TABLE "BookingTemplate" ADD CONSTRAINT "BookingTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTemplate" ADD CONSTRAINT "BookingTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingTemplate" ENABLE row level security;
