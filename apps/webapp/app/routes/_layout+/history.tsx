/**
 * Workspace History page
 *
 * Lists the deletion history of the workspace: assets, kits and bookings that
 * were permanently deleted, including who deleted them, when, why
 * (Broken/Missing/Replaced/Other) and a snapshot of useful details
 * (category, location, custodian, booking period...).
 *
 * Access is restricted to admins/owners via the `deletedItemRecord` entity.
 *
 * @see {@link file://./../../modules/deleted-item-record/service.server.ts}
 */
import type { DeletedItemRecord, User } from "@prisma/client";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link } from "react-router";
import { ErrorContent } from "~/components/errors";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { List } from "~/components/list";
import { ListContentWrapper } from "~/components/list/content-wrapper";
import { Filters } from "~/components/list/filters";
import { Badge } from "~/components/shared/badge";
import { DateS } from "~/components/shared/date";
import { GrayBadge } from "~/components/shared/gray-badge";
import { Td, Th } from "~/components/table";
import { useSearchParams } from "~/hooks/search-params";
import { getPaginatedDeletedItemRecords } from "~/modules/deleted-item-record/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { resolveUserDisplayName } from "~/utils/user";

/** Human readable labels for the deletion reasons */
const REASON_LABELS: Record<string, string> = {
  BROKEN: "Broken",
  MISSING: "Missing",
  REPLACED: "Replaced",
  OTHER: "Other",
};

/** Badge colors per item type */
const TYPE_COLORS: Record<string, string> = {
  ASSET: "#027A48",
  KIT: "#175CD3",
  BOOKING: "#6941C6",
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.deletedItemRecord,
      action: PermissionAction.read,
    });

    const { records, totalRecords, page, perPage, totalPages, search } =
      await getPaginatedDeletedItemRecords({ organizationId, request });

    const header: HeaderData = { title: "History" };
    const modelName = {
      singular: "record",
      plural: "records",
    };

    return payload({
      header,
      modelName,
      items: records,
      totalItems: totalRecords,
      page,
      perPage,
      totalPages,
      search,
      searchFieldLabel: "Search history",
      searchFieldTooltip: {
        title: "Search the deletion history",
        text: "Search by item name or ID of deleted assets, kits and bookings.",
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: appendToMetaTitle(data?.header.title) },
];

export const handle = {
  breadcrumb: () => <Link to="/history">History</Link>,
};

export default function HistoryPage() {
  return (
    <>
      <Header
        subHeading="A permanent record of deleted assets, kits and bookings — who removed them, when and why."
        hidePageDescription={false}
      />
      <ListContentWrapper className="mb-4">
        <Filters
          slots={{
            "right-of-search": <ItemTypeFilter />,
          }}
        />
        <List
          className="overflow-x-hidden"
          ItemComponent={ListContent}
          customEmptyStateContent={{
            title: "No deletion history yet",
            text: "When assets, kits or bookings get deleted, a record will show up here.",
          }}
          headerChildren={
            <>
              <Th>Type</Th>
              <Th>Reason</Th>
              <Th>Details</Th>
              <Th>Deleted by</Th>
              <Th>Date</Th>
            </>
          }
        />
      </ListContentWrapper>
    </>
  );
}

/** Simple item type filter that writes the `itemType` search param */
function ItemTypeFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get("itemType") ?? "";

  return (
    <select
      aria-label="Filter by item type"
      className="h-10 rounded border border-gray-300 px-3 text-sm text-gray-700"
      value={current}
      onChange={(event) => {
        setSearchParams((prev) => {
          if (event.target.value) {
            prev.set("itemType", event.target.value);
          } else {
            prev.delete("itemType");
          }
          prev.delete("page");
          return prev;
        });
      }}
    >
      <option value="">All types</option>
      <option value="ASSET">Assets</option>
      <option value="KIT">Kits</option>
      <option value="BOOKING">Bookings</option>
    </select>
  );
}

type HistoryItem = DeletedItemRecord & {
  deletedBy: Pick<
    User,
    "id" | "firstName" | "lastName" | "displayName" | "profilePicture"
  > | null;
};

/**
 * Renders a short human readable summary of the snapshot JSON
 * (category, location, custodian, booking period, asset count).
 */
function snapshotSummary(item: HistoryItem): string[] {
  const snapshot = (item.snapshot ?? {}) as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof snapshot.category === "string") {
    parts.push(`Category: ${snapshot.category}`);
  }
  if (typeof snapshot.location === "string") {
    parts.push(`Location: ${snapshot.location}`);
  }
  if (typeof snapshot.kit === "string") {
    parts.push(`Kit: ${snapshot.kit}`);
  }
  if (typeof snapshot.custodian === "string") {
    parts.push(`Custodian: ${snapshot.custodian}`);
  }
  if (typeof snapshot.assetCount === "number") {
    parts.push(`${snapshot.assetCount} assets`);
  }

  return parts;
}

function ListContent({ item }: { item: HistoryItem }) {
  const summary = snapshotSummary(item);
  const snapshot = (item.snapshot ?? {}) as Record<string, unknown>;
  const hasPeriod =
    typeof snapshot.from === "string" && typeof snapshot.to === "string";

  return (
    <>
      {/* Item name */}
      <Td className="md:min-w-60">
        <div className="flex flex-col">
          <span className="font-medium text-gray-900">{item.itemName}</span>
          {item.sequentialId ? (
            <span className="text-xs text-gray-500">{item.sequentialId}</span>
          ) : null}
        </div>
      </Td>

      {/* Type */}
      <Td>
        <Badge color={TYPE_COLORS[item.itemType] ?? "#475467"} withDot={false}>
          {item.itemType.charAt(0) + item.itemType.slice(1).toLowerCase()}
        </Badge>
      </Td>

      {/* Reason */}
      <Td>
        {item.reason ? (
          <div className="flex flex-col">
            <GrayBadge>{REASON_LABELS[item.reason] ?? item.reason}</GrayBadge>
            {item.reasonNote ? (
              <span className="max-w-62 mt-1 truncate text-xs text-gray-500">
                {item.reasonNote}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </Td>

      {/* Details from snapshot */}
      <Td className="max-w-62 md:max-w-96">
        <div className="flex flex-col text-xs text-gray-600">
          {summary.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {hasPeriod ? (
            <span>
              <DateS date={snapshot.from as string} /> –{" "}
              <DateS date={snapshot.to as string} />
            </span>
          ) : null}
          {summary.length === 0 && !hasPeriod ? (
            <span className="text-gray-400">—</span>
          ) : null}
        </div>
      </Td>

      {/* Deleted by */}
      <Td>
        {item.deletedBy ? (
          <span className="text-sm text-gray-700">
            {resolveUserDisplayName(item.deletedBy)}
          </span>
        ) : (
          <span className="text-gray-400">Unknown</span>
        )}
      </Td>

      {/* Date */}
      <Td>
        <span className="whitespace-nowrap text-sm text-gray-600">
          <DateS date={item.createdAt} includeTime />
        </span>
      </Td>
    </>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
