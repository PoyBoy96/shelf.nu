import type { Asset, Booking, Currency } from "@prisma/client";
import { BookingStatus } from "@prisma/client";
import { BADGE_COLORS, type BadgeColorScheme } from "./badge-colors";
import { formatCurrency } from "./currency";
import { resolveTeamMemberName } from "./user";

/**
 * Checks whether the given user "owns" a booking, meaning they either
 * created it or are its custodian.
 *
 * Used to decide if base/self-service users may modify a booking after it has
 * started (e.g. adding forgotten gear to an ONGOING booking).
 *
 * @param booking - Booking with creator/custodian user ids
 * @param userId - The user to check ownership for
 * @returns true when the user created the booking or is its custodian
 */
export function isBookingOwnedByUser(
  booking: {
    creatorId?: string | null;
    custodianUserId?: string | null;
  },
  userId?: string | null
) {
  return Boolean(
    userId &&
      (booking.creatorId === userId || booking.custodianUserId === userId)
  );
}

/**
 * Determines whether a user can manage (add/remove) the assets of a booking.
 *
 * Rules:
 * - Nobody can manage assets of COMPLETE, ARCHIVED or CANCELLED bookings.
 * - Admins/owners can manage assets in any other status.
 * - Base/self-service users can manage assets while the booking is a DRAFT.
 * - Base/self-service users who own the booking (creator or custodian) can
 *   also manage assets while the booking is ONGOING or OVERDUE. This allows
 *   them to add forgotten gear after the start time without moving the
 *   booking dates. Newly added assets are checked out immediately by
 *   `updateBookingAssets`.
 *
 * @param booking - Booking status + creator/custodian info
 * @param isSelfService - Whether the current user has a restricted role (BASE or SELF_SERVICE)
 * @param userId - The current user id, used for the ownership exception
 */
export function canUserManageBookingAssets(
  booking: Pick<Booking, "status"> & {
    from?: Booking["from"] | string | null;
    to?: Booking["to"] | string | null;
    creatorId?: string | null;
    custodianUserId?: string | null;
  },
  isSelfService: boolean,
  userId?: string | null
) {
  const isCompleted = booking.status === BookingStatus.COMPLETE;
  const isArchived = booking.status === BookingStatus.ARCHIVED;
  const isCancelled = booking.status === BookingStatus.CANCELLED;

  /** Owners of an active booking may keep managing assets after checkout */
  const isOwnActiveBooking =
    isBookingOwnedByUser(booking, userId) &&
    (booking.status === BookingStatus.ONGOING ||
      booking.status === BookingStatus.OVERDUE);

  const cantManageAssetsAsSelfService =
    isSelfService &&
    booking.status !== BookingStatus.DRAFT &&
    !isOwnActiveBooking;

  return (
    !isCompleted &&
    !isArchived &&
    !isCancelled &&
    !cantManageAssetsAsSelfService
  );
}

export const bookingStatusColorMap: {
  [key in BookingStatus]: BadgeColorScheme;
} = {
  DRAFT: BADGE_COLORS.gray,
  RESERVED: BADGE_COLORS.blue,
  ONGOING: BADGE_COLORS.violet,
  OVERDUE: BADGE_COLORS.red,
  COMPLETE: BADGE_COLORS.green,
  ARCHIVED: BADGE_COLORS.gray,
  CANCELLED: BADGE_COLORS.gray,
};

/**
 * Calculates the total value of assets in a booking.
 * @param assets - Array of assets with their valuations.
 * @param currency - The currency in which the total value should be formatted.
 * @param locale - The locale for formatting the currency.
 * @returns A formatted string representing the total value of assets.
 * @example
 * const totalValue = calculateTotalValueOfAssets({
 *   assets: [{ valuation: 100 }, { valuation: 200 }],
 *   currency: "USD",
 *   locale: "en-US",
 * });
 * Returns "$300.00"
 */
/** Resolve custodian display name from booking data */
export function getBookingCustodianName(booking: {
  custodianTeamMember?: { name: string } | null;
  custodianUser?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}): string | null {
  if (booking.custodianTeamMember) {
    return resolveTeamMemberName({
      name: booking.custodianTeamMember.name,
    });
  }
  if (booking.custodianUser) {
    return resolveTeamMemberName({
      name: "",
      user: booking.custodianUser,
    });
  }
  return null;
}

export function calculateTotalValueOfAssets({
  assets,
  currency,
  locale,
}: {
  assets: Pick<Asset, "valuation">[];
  currency: Currency;
  locale: string;
}): string {
  const value = assets.reduce((acc, asset) => acc + (asset.valuation || 0), 0);
  return formatCurrency({
    value: value,
    locale,
    currency,
  });
}
