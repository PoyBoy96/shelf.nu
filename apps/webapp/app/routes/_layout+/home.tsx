import type {
  MetaFunction,
  LoaderFunctionArgs,
  LinksFunction,
} from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { ErrorContent } from "~/components/errors";
import { HomeDashboardContent } from "~/components/home/dashboard-content";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import { db } from "~/database/db.server";
import { getUpcomingRemindersForHomePage } from "~/modules/asset-reminder/service.server";
import { getBookings } from "~/modules/booking/service.server";

import calendarStyles from "~/styles/layout/calendar.css?url";
import styles from "~/styles/layout/skeleton-loading.css?url";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { getStatusClasses, isOneDayEvent } from "~/utils/calendar";
import { userPrefs } from "~/utils/cookies.server";
import {
  buildAssetsByStatusChart,
  buildMonthlyGrowthData,
  checklistOptions,
} from "~/utils/dashboard.server";
import { ShelfError, makeShelfError } from "~/utils/error";
import { payload, error } from "~/utils/http.server";
import { parseMarkdownToReact } from "~/utils/md";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { resolveUserDisplayName } from "~/utils/user";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, canSeeAllCustody } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.dashboard,
      action: PermissionAction.read,
    });

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const [
      assetAggregation,
      statusGroups,
      monthlyRows,
      baselineCount,
      { bookings: upcomingBookings },
      { bookings: overdueBookings },
      { bookings: activeBookings },
      { bookings: calendarBookings },
      upcomingReminders,
      announcement,
      teamMembersCount,
      locationDistribution,
      locationsCount,
      categoriesCount,
      cookieResult,
    ] = await Promise.all([
      db.asset
        .aggregate({
          where: { organizationId },
          _count: { _all: true },
          _sum: { valuation: true },
        })
        .catch((cause) => {
          throw new ShelfError({
            cause,
            message: "Failed to load asset aggregation",
            additionalData: { userId, organizationId },
            label: "Dashboard",
          });
        }),

      db.asset.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),

      db.$queryRaw<{ month_start: Date; assets_created: number }[]>`
        SELECT date_trunc('month', "createdAt") AS month_start,
               COUNT(*)::int AS assets_created
        FROM "Asset"
        WHERE "organizationId" = ${organizationId}
          AND "createdAt" >= ${twelveMonthsAgo}
        GROUP BY 1
        ORDER BY 1`,

      db.asset.count({
        where: { organizationId, createdAt: { lt: twelveMonthsAgo } },
      }),

      getBookings({
        organizationId,
        userId,
        page: 1,
        perPage: 5,
        statuses: ["RESERVED"],
        bookingFrom: new Date(),
        bookingTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        extraInclude: {
          custodianTeamMember: true,
          custodianUser: true,
          _count: { select: { assets: true } },
        },
      }),

      getBookings({
        organizationId,
        userId,
        page: 1,
        perPage: 5,
        statuses: ["OVERDUE"],
        extraInclude: {
          custodianTeamMember: true,
          custodianUser: true,
          _count: { select: { assets: true } },
        },
      }),

      getBookings({
        organizationId,
        userId,
        page: 1,
        perPage: 5,
        statuses: ["ONGOING"],
        extraInclude: {
          custodianTeamMember: true,
          custodianUser: true,
          _count: { select: { assets: true } },
        },
      }),

      getBookings({
        organizationId,
        userId,
        page: 1,
        statuses: ["RESERVED", "ONGOING", "OVERDUE"],
        bookingFrom: monthStart,
        bookingTo: monthEnd,
        takeAll: true,
        extraInclude: {
          custodianTeamMember: true,
          custodianUser: true,
        },
      }),

      getUpcomingRemindersForHomePage({ organizationId }),

      db.announcement
        .findFirst({
          where: { published: true },
          orderBy: { createdAt: "desc" },
        })
        .catch((cause) => {
          throw new ShelfError({
            cause,
            message: "Failed to load announcement",
            additionalData: { userId, organizationId },
            label: "Dashboard",
          });
        }),

      db.teamMember.count({
        where: { organizationId, deletedAt: null },
      }),

      db.location
        .findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            _count: { select: { assets: true } },
          },
          orderBy: { assets: { _count: "desc" } },
          take: 5,
        })
        .then((locs) =>
          locs
            .filter((l) => l._count.assets > 0)
            .map((l) => ({
              locationId: l.id,
              locationName: l.name,
              assetCount: l._count.assets,
            }))
        ),

      db.location.count({
        where: { organizationId },
      }),

      db.category.count({
        where: { organizationId },
      }),

      userPrefs.parse(request.headers.get("Cookie")).then((c: any) => c || {}),
    ]);

    const totalAssets = assetAggregation._count._all;

    const bookingsCalendarEvents = calendarBookings
      .filter((booking) => booking.from && booking.to)
      .map((booking) => {
        const custodianName = booking.custodianUser
          ? resolveUserDisplayName(booking.custodianUser)
          : booking.custodianTeamMember?.name;

        let title = booking.name;
        if (canSeeAllCustody && custodianName) {
          title += ` | ${custodianName}`;
        }

        return {
          title,
          start: booking.from!.toISOString(),
          end: booking.to!.toISOString(),
          classNames: [
            `bookingId-${booking.id}`,
            ...getStatusClasses(
              booking.status,
              isOneDayEvent(booking.from, booking.to),
              "dayGridMonth"
            ),
          ],
          extendedProps: {
            id: booking.id,
            url: `/bookings/${booking.id}`,
            status: booking.status,
          },
        };
      });

    const header: HeaderData = {
      title: "Home",
    };

    return payload({
      header,
      totalAssets,
      teamMembersCount,
      locationsCount,
      categoriesCount,
      upcomingBookings,
      overdueBookings,
      activeBookings,
      bookingsCalendarEvents,
      upcomingReminders,
      locationDistribution,
      skipOnboardingChecklist: cookieResult.skipOnboardingChecklist,
      assetsByStatus: buildAssetsByStatusChart(statusGroups),
      assetGrowthData: buildMonthlyGrowthData(monthlyRows, baselineCount),
      announcement: announcement
        ? {
            ...announcement,
            content: parseMarkdownToReact(announcement.content),
          }
        : null,
      checklistOptions: await checklistOptions({
        hasAssets: totalAssets > 0,
        organizationId,
      }),
    });
  } catch (cause) {
    const reason = makeShelfError(cause);
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = () => [
  { title: appendToMetaTitle("Home") },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
  { rel: "stylesheet", href: calendarStyles },
];

export const handle = {
  breadcrumb: () => <Link to="/home">Home</Link>,
};

export default function HomePage() {
  const { skipOnboardingChecklist, checklistOptions } =
    useLoaderData<typeof loader>();

  return (
    <div>
      <Header> </Header>
      <HomeDashboardContent
        skipOnboardingChecklist={skipOnboardingChecklist}
        checklistOptions={checklistOptions}
      />
    </div>
  );
}

export const ErrorBoundary = () => <ErrorContent />;
