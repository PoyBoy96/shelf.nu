import { BookingStatus, OrganizationRoles } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";

import { db } from "~/database/db.server";
import {
  reserveBooking,
  checkoutBooking,
} from "~/modules/booking/service.server";
import { requirePermission } from "~/utils/roles.server";
import { action } from "./bookings.$bookingId.overview";

// @vitest-environment node

vi.mock("~/database/db.server", () => ({
  db: {
    booking: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("~/modules/booking/service.server", () => ({
  reserveBooking: vi.fn(),
  checkoutBooking: vi.fn(),
  updateBasicBooking: vi.fn(),
  deleteBooking: vi.fn(),
  checkinBooking: vi.fn(),
  checkinAssets: vi.fn(),
  archiveBooking: vi.fn(),
  cancelBooking: vi.fn(),
  extendBooking: vi.fn(),
  getBooking: vi.fn(),
  getBookingFlags: vi.fn(),
  getDetailedPartialCheckinData: vi.fn(),
  removeAssets: vi.fn(),
  revertBookingToDraft: vi.fn(),
  updateBookingNotificationRecipients: vi.fn(),
}));

vi.mock("~/modules/user/service.server", () => ({
  getUserByID: vi.fn().mockResolvedValue({
    id: "user-123",
    firstName: "Test",
    lastName: "User",
  }),
}));

vi.mock("~/modules/working-hours/service.server", () => ({
  getWorkingHoursForOrganization: vi.fn().mockResolvedValue({}),
}));

vi.mock("~/modules/booking-settings/service.server", () => ({
  getBookingSettingsForOrganization: vi.fn().mockResolvedValue({}),
}));

vi.mock("~/modules/organization/context.server", () => ({
  setSelectedOrganizationIdCookie: vi
    .fn()
    .mockResolvedValue("selected-org=cookie"),
}));

vi.mock("~/utils/cookies.server", () => ({
  setCookie: vi.fn((value: string) => value),
  updateCookieWithPerPage: vi.fn(),
  userPrefs: vi.fn(),
}));

vi.mock("~/utils/roles.server", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("~/utils/logger", () => ({
  logMissingFormIntent: vi.fn(),
}));

vi.mock("~/utils/http.server", async () => {
  const actual = await vi.importActual("~/utils/http.server");
  return {
    ...actual,
    getParams: vi.fn(() => ({ bookingId: "booking-1" })),
    parseData: vi.fn((_formData: FormData, schema: unknown) => {
      if ((schema as { shape?: Record<string, unknown> })?.shape?.intent) {
        return {
          intent: "reserve",
          checkoutIntentChoice: undefined,
          checkinIntentChoice: undefined,
        };
      }

      return {
        name: "Test booking",
        description: "desc",
        custodian: { id: "team-member-1", userId: "owner-456" },
        tags: "",
      };
    }),
    payload: vi.fn((value) => value),
    error: vi.fn((value) => value),
  };
});

vi.mock("~/utils/emitter/send-notification.server", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("~/modules/note/service.server", () => ({
  createNotes: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  const mockResponse = (data: unknown, init?: { status?: number }) =>
    new Response(JSON.stringify(data), {
      status: init?.status || 200,
      headers: { "Content-Type": "application/json" },
    });

  return {
    ...actual,
    data: vi.fn(mockResponse),
    redirect: vi.fn(() => new Response(null, { status: 302 })),
  };
});

const requirePermissionMock = vi.mocked(requirePermission);
const bookingFindUniqueOrThrowMock = vi.mocked(db.booking.findUniqueOrThrow);
const reserveBookingMock = vi.mocked(reserveBooking);
const checkoutBookingMock = vi.mocked(checkoutBooking);

const context = {
  getSession: () => ({ userId: "user-123" }),
} as any;

describe("bookings.$bookingId.overview action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    bookingFindUniqueOrThrowMock.mockResolvedValue({
      id: "booking-1",
      status: BookingStatus.DRAFT,
      from: new Date("2026-04-15T10:00:00.000Z"),
      to: new Date("2026-04-16T10:00:00.000Z"),
      creatorId: "owner-456",
      custodianUserId: "owner-456",
    } as any);
  });

  it("blocks BASE users from reserving someone else's booking even when they can see all bookings", async () => {
    requirePermissionMock.mockResolvedValue({
      organizationId: "org-1",
      role: OrganizationRoles.BASE,
      isSelfServiceOrBase: true,
      canSeeAllBookings: true,
    } as any);

    const formData = new FormData();
    formData.set("intent", "reserve");

    const request = new Request(
      "https://example.com/bookings/booking-1/overview",
      {
        method: "POST",
        body: formData,
      }
    );

    const response = await action(
      createActionArgs({ context, request, params: { bookingId: "booking-1" } })
    );

    expect((response as Response).status).toBe(403);
    expect(reserveBookingMock).not.toHaveBeenCalled();
  });

  it("blocks SELF_SERVICE users from checking out someone else's booking even when they can see all bookings", async () => {
    requirePermissionMock.mockResolvedValue({
      organizationId: "org-1",
      role: OrganizationRoles.SELF_SERVICE,
      isSelfServiceOrBase: true,
      canSeeAllBookings: true,
    } as any);

    const httpServer = await import("~/utils/http.server");
    vi.mocked(httpServer.parseData).mockImplementationOnce(() => ({
      intent: "checkOut",
      checkoutIntentChoice: undefined,
      checkinIntentChoice: undefined,
    }));

    const formData = new FormData();
    formData.set("intent", "checkOut");

    const request = new Request(
      "https://example.com/bookings/booking-1/overview",
      {
        method: "POST",
        body: formData,
      }
    );

    const response = await action(
      createActionArgs({ context, request, params: { bookingId: "booking-1" } })
    );

    expect((response as Response).status).toBe(403);
    expect(checkoutBookingMock).not.toHaveBeenCalled();
  });
});
