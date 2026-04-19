-- CreateTable
CREATE TABLE "AssetFavorite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_favorites_owner_asset_unique" ON "AssetFavorite"("organizationId", "ownerId", "assetId");

-- CreateIndex
CREATE INDEX "asset_favorites_owner_lookup_idx" ON "AssetFavorite"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "asset_favorites_asset_idx" ON "AssetFavorite"("assetId");

-- AddForeignKey
ALTER TABLE "AssetFavorite" ADD CONSTRAINT "AssetFavorite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFavorite" ADD CONSTRAINT "AssetFavorite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetFavorite" ADD CONSTRAINT "AssetFavorite_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetFavorite" ENABLE row level security;
