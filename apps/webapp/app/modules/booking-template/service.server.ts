import type { BookingStatus } from "@prisma/client";
import { AssetStatus, type Prisma } from "@prisma/client";

import { db } from "~/database/db.server";
import { getDetailedPartialCheckinData } from "~/modules/booking/service.server";
import { isAssetPartiallyCheckedIn } from "~/utils/booking-assets";
import { ShelfError } from "~/utils/error";

import { MAX_SAVED_BOOKING_TEMPLATES } from "./constants";

export type BookingTemplateItemSnapshot = {
  assetId: string;
  title: string;
  sequentialId: string | null;
};

function normalizeName(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new ShelfError({
      cause: null,
      label: "Booking",
      message: "Name is required.",
      status: 400,
    });
  }

  return trimmed;
}

function toTemplateItemsJson(
  items: BookingTemplateItemSnapshot[]
): Prisma.JsonArray {
  return items.map((item) => ({
    assetId: item.assetId,
    title: item.title,
    sequentialId: item.sequentialId,
  })) as Prisma.JsonArray;
}

export function parseTemplateItems(
  value: Prisma.JsonValue | null | undefined
): BookingTemplateItemSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (
      typeof record.assetId !== "string" ||
      typeof record.title !== "string"
    ) {
      return [];
    }

    return [
      {
        assetId: record.assetId,
        title: record.title,
        sequentialId:
          typeof record.sequentialId === "string" ? record.sequentialId : null,
      },
    ];
  });
}

async function assertTemplateOwnership({
  id,
  organizationId,
  ownerId,
}: {
  id: string;
  organizationId: string;
  ownerId: string;
}) {
  const template = await db.bookingTemplate.findFirst({
    where: { id, organizationId, ownerId },
  });

  if (!template) {
    throw new ShelfError({
      cause: null,
      label: "Booking",
      message: "We couldn't find that booking template.",
      status: 404,
      shouldBeCaptured: false,
    });
  }

  return template;
}

export async function listBookingTemplatesForUser({
  organizationId,
  ownerId,
}: {
  organizationId: string;
  ownerId: string;
}) {
  const templates = await db.bookingTemplate.findMany({
    where: { organizationId, ownerId },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return templates.map((template) => ({
    ...template,
    items: parseTemplateItems(template.itemsJson),
  }));
}

export async function createBookingTemplate({
  organizationId,
  ownerId,
  name,
  items,
}: {
  organizationId: string;
  ownerId: string;
  name: string;
  items: BookingTemplateItemSnapshot[];
}) {
  const trimmedName = normalizeName(name);
  const normalizedItems = items.filter(
    (item, index, arr) =>
      !!item.assetId &&
      arr.findIndex((candidate) => candidate.assetId === item.assetId) === index
  );

  if (normalizedItems.length === 0) {
    throw new ShelfError({
      cause: null,
      label: "Booking",
      message: "Add at least one non-kit asset before saving a template.",
      status: 400,
      shouldBeCaptured: false,
    });
  }

  return db.$transaction(async (tx) => {
    const existingCount = await tx.bookingTemplate.count({
      where: { organizationId, ownerId },
    });

    if (existingCount >= MAX_SAVED_BOOKING_TEMPLATES) {
      throw new ShelfError({
        cause: null,
        label: "Booking",
        message: `You can only save up to ${MAX_SAVED_BOOKING_TEMPLATES} booking templates. Please delete one before creating a new one.`,
        status: 400,
      });
    }

    const existingByName = await tx.bookingTemplate.findFirst({
      where: { organizationId, ownerId, name: trimmedName },
    });

    if (existingByName) {
      throw new ShelfError({
        cause: null,
        label: "Booking",
        message:
          "You already have a booking template with this name. Please use a different name.",
        status: 409,
        shouldBeCaptured: false,
      });
    }

    const template = await tx.bookingTemplate.create({
      data: {
        organizationId,
        ownerId,
        name: trimmedName,
        itemsJson: toTemplateItemsJson(normalizedItems),
      },
    });

    return {
      ...template,
      items: normalizedItems,
    };
  });
}

function getAssetUnavailableReason(asset: {
  availableToBook: boolean;
  kitId: string | null;
  status: AssetStatus;
}) {
  if (!asset.availableToBook) {
    return "Unavailable for booking";
  }

  if (asset.kitId) {
    return "Managed through kits";
  }

  if (asset.status === AssetStatus.CHECKED_OUT) {
    return "Already checked out";
  }

  if (asset.status === AssetStatus.IN_CUSTODY) {
    return "Currently in custody";
  }

  return "Currently unavailable";
}

export async function applyBookingTemplate({
  templateId,
  organizationId,
  ownerId,
  bookingId,
  bookingStatus,
}: {
  templateId: string;
  organizationId: string;
  ownerId: string;
  bookingId: string;
  bookingStatus: BookingStatus;
}) {
  const template = await assertTemplateOwnership({
    id: templateId,
    organizationId,
    ownerId,
  });

  const items = parseTemplateItems(template.itemsJson);
  const assetIds = items.map((item) => item.assetId);

  if (assetIds.length === 0) {
    return {
      templateId: template.id,
      templateName: template.name,
      availableAssets: [],
      unavailableAssets: [],
      missingAssets: [],
    };
  }

  const { partialCheckinDetails } =
    await getDetailedPartialCheckinData(bookingId);

  const assets = await db.asset.findMany({
    where: {
      organizationId,
      id: { in: assetIds },
    },
    select: {
      id: true,
      title: true,
      sequentialId: true,
      availableToBook: true,
      kitId: true,
      status: true,
    },
  });

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

  const availableAssets: Array<{
    id: string;
    title: string;
    sequentialId: string | null;
    kitId: null;
  }> = [];
  const unavailableAssets: Array<{
    assetId: string;
    title: string;
    sequentialId: string | null;
    reason: string;
  }> = [];
  const missingAssets: Array<{
    assetId: string;
    title: string;
    sequentialId: string | null;
  }> = [];

  for (const item of items) {
    const asset = assetsById.get(item.assetId);

    if (!asset) {
      missingAssets.push(item);
      continue;
    }

    const isCheckedOutButReusable =
      asset.status === AssetStatus.CHECKED_OUT &&
      isAssetPartiallyCheckedIn(asset, partialCheckinDetails, bookingStatus);

    const isAvailable =
      asset.availableToBook &&
      !asset.kitId &&
      (asset.status === AssetStatus.AVAILABLE || isCheckedOutButReusable);

    if (isAvailable) {
      availableAssets.push({
        id: asset.id,
        title: asset.title,
        sequentialId: asset.sequentialId,
        kitId: null,
      });
      continue;
    }

    unavailableAssets.push({
      assetId: asset.id,
      title: asset.title,
      sequentialId: asset.sequentialId,
      reason: getAssetUnavailableReason(asset),
    });
  }

  return {
    templateId: template.id,
    templateName: template.name,
    availableAssets,
    unavailableAssets,
    missingAssets,
  };
}
