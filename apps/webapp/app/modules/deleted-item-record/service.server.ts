/**
 * Deleted Item Record Service
 *
 * Maintains the deletion history of the workspace. Whenever an asset, kit or
 * booking is permanently deleted, a `DeletedItemRecord` is written so teams
 * can look back at what equipment existed, who deleted it, when and why
 * (Broken / Missing / Replaced / Other), together with a JSON snapshot of
 * useful details (category, location, custodian, booking period, ...).
 *
 * Records are organization-scoped and survive the deletion of the actor user
 * (the FK is SetNull).
 *
 * @see {@link file://./../../routes/_layout+/history.tsx} - History page listing these records
 * @see {@link file://./../asset/service.server.ts} - deleteAsset/bulkDeleteAssets write records
 * @see {@link file://./../kit/service.server.ts} - deleteKit writes records
 * @see {@link file://./../booking/service.server.ts} - deleteBooking writes records
 */
import type {
  DeletedItemRecord,
  DeletedItemType,
  DeletionReason,
  Organization,
  Prisma,
  User,
} from "@prisma/client";
import { db } from "~/database/db.server";
import { updateCookieWithPerPage } from "~/utils/cookies.server";
import type { ErrorLabel } from "~/utils/error";
import { ShelfError } from "~/utils/error";
import { getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";

const label: ErrorLabel = "Deleted Item Record";

/** Arguments for creating a single deletion history record */
export type CreateDeletedItemRecordArgs = {
  itemType: DeletedItemType;
  /** The id the item had before deletion */
  itemId: string;
  itemName: string;
  sequentialId?: string | null;
  reason?: DeletionReason | null;
  reasonNote?: string | null;
  /** JSON snapshot with details worth keeping for future reference */
  snapshot?: Prisma.InputJsonValue;
  deletedById?: User["id"] | null;
  organizationId: Organization["id"];
};

/**
 * Builds the Prisma `create` data for a deletion history record.
 * Exposed separately so callers can create records inside their own
 * transactions (e.g. record + delete atomically).
 *
 * @param args - The record details
 * @returns Data object usable with `tx.deletedItemRecord.create({ data })`
 */
export function buildDeletedItemRecordData(
  args: CreateDeletedItemRecordArgs
): Prisma.DeletedItemRecordUncheckedCreateInput {
  return {
    itemType: args.itemType,
    itemId: args.itemId,
    itemName: args.itemName,
    sequentialId: args.sequentialId ?? null,
    reason: args.reason ?? null,
    reasonNote: args.reasonNote ?? null,
    snapshot: args.snapshot,
    deletedById: args.deletedById ?? null,
    organizationId: args.organizationId,
  };
}

/**
 * Creates a deletion history record outside of a transaction.
 *
 * @param args - The record details
 * @returns The created DeletedItemRecord
 * @throws {ShelfError} If the database operation fails
 */
export async function createDeletedItemRecord(
  args: CreateDeletedItemRecordArgs
): Promise<DeletedItemRecord> {
  try {
    return await db.deletedItemRecord.create({
      data: buildDeletedItemRecordData(args),
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while saving the deletion history.",
      additionalData: { ...args, snapshot: undefined },
      label,
    });
  }
}

/**
 * Fetches paginated deletion history records for an organization.
 * Supports `search` (item name), `itemType` filter and pagination via the
 * standard list search params.
 *
 * @param params.organizationId - Organization scope
 * @param params.request - Request used to read search params & per-page cookie
 * @returns Paginated records plus pagination metadata
 * @throws {ShelfError} If the database operation fails
 */
export async function getPaginatedDeletedItemRecords({
  organizationId,
  request,
}: {
  organizationId: Organization["id"];
  request: Request;
}) {
  try {
    const searchParams = getCurrentSearchParams(request);
    const { page, perPageParam, search } = getParamsValues(searchParams);
    const itemType = searchParams.get("itemType");

    const cookie = await updateCookieWithPerPage(request, perPageParam);
    const { perPage } = cookie;

    const skip = page > 1 ? (page - 1) * perPage : 0;
    const take = perPage >= 1 && perPage <= 100 ? perPage : 20;

    const where: Prisma.DeletedItemRecordWhereInput = { organizationId };

    if (search) {
      where.OR = [
        { itemName: { contains: search.trim(), mode: "insensitive" } },
        { sequentialId: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (itemType && ["ASSET", "KIT", "BOOKING"].includes(itemType)) {
      where.itemType = itemType as DeletedItemType;
    }

    const [records, totalRecords] = await Promise.all([
      db.deletedItemRecord.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          deletedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              displayName: true,
              profilePicture: true,
            },
          },
        },
      }),
      db.deletedItemRecord.count({ where }),
    ]);

    return {
      records,
      totalRecords,
      page,
      perPage: take,
      search,
      totalPages: Math.ceil(totalRecords / take),
      cookie,
    };
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Something went wrong while fetching the deletion history.",
      additionalData: { organizationId },
      label,
    });
  }
}
