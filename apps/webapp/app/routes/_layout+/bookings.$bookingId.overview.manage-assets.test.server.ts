import { AssetStatus, BookingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";

import { db } from "~/database/db.server";
import * as assetUtils from "~/modules/asset/utils.server";
import * as bookingService from "~/modules/booking/service.server";
import * as bookingTemplateService from "~/modules/booking-template/service.server";
import * as noteService from "~/modules/note/service.server";
import * as userService from "~/modules/user/service.server";
import * as bookingAssets from "~/utils/booking-assets";
import * as httpServer from "~/utils/http.server";
import * as rolesServer from "~/utils/roles.server";

// Import the action function
import {
  action,
  applyTemplateAssetsToSelection,
  buildLastUserMap,
  mergeTemplateAssetsIntoSelection,
} from "./bookings.$bookingId.overview.manage-assets";
import { assertIsDataWithResponseInit } from "../../../test/helpers/assertions";

// @vitest-environment node

// Mock external dependencies
vi.mock("~/database/db.server", () => ({
  db: {
    booking: {
      findUniqueOrThrow: vi.fn(),
    },
    asset: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    assetFavorite: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("~/modules/booking/service.server", () => ({
  getDetailedPartialCheckinData: vi.fn(),
  updateBookingAssets: vi.fn(),
  removeAssets: vi.fn(),
}));

vi.mock("~/modules/booking-template/service.server", () => ({
  applyBookingTemplate: vi.fn(),
  createBookingTemplate: vi.fn(),
  listBookingTemplatesForUser: vi.fn(),
}));

vi.mock("~/modules/user/service.server", () => ({
  getUserByID: vi.fn(),
}));

vi.mock("~/modules/booking/email-helpers", () => ({
  sendBookingUpdatedEmail: vi.fn(),
}));

vi.mock("~/modules/note/service.server", () => ({
  createNotes: vi.fn(),
}));

vi.mock("~/utils/booking-assets", () => ({
  isAssetPartiallyCheckedIn: vi.fn(),
}));

vi.mock("~/utils/roles.server", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("~/utils/http.server", () => ({
  getParams: vi.fn(),
  parseData: vi.fn(),
  payload: vi.fn((data) => ({ error: null, ...data })),
  json: vi.fn((data) => data),
  getCurrentSearchParams: vi.fn(),
  error: vi.fn((reason) => reason),
}));

vi.mock("~/modules/asset/utils.server", () => ({
  getAssetsWhereInput: vi.fn(),
}));

// Mock request and context objects
const mockContext = {
  getSession: () => ({ userId: "user123" }),
  appVersion: "1.0.0",
  isAuthenticated: true,
  setSession: vi.fn(),
  destroySession: vi.fn(),
  errorMessage: null,
} as any;

const mockRequest = {
  formData: () => Promise.resolve(new FormData()),
  cache: "default",
  credentials: "same-origin",
  destination: "",
  headers: new Headers(),
  integrity: "",
  method: "POST",
  mode: "cors",
  redirect: "follow",
  referrer: "",
  url: "http://localhost",
} as any;

const mockParams = { bookingId: "booking123" };

describe("mergeTemplateAssetsIntoSelection", () => {
  it("preserves existing selection and only adds new template assets", () => {
    expect(
      mergeTemplateAssetsIntoSelection(
        [
          { id: "asset-1", title: "Already selected" },
          { id: "asset-2", title: "Already booked" },
        ],
        [
          { id: "asset-2", title: "Already booked" },
          { id: "asset-3", title: "New from template" },
        ]
      )
    ).toEqual([{ id: "asset-3", title: "New from template" }]);
  });
});

describe("applyTemplateAssetsToSelection", () => {
  it("keeps existing booking assets selected while appending new template assets", () => {
    expect(
      applyTemplateAssetsToSelection(
        [
          { id: "asset-1", title: "Already selected" },
          { id: "asset-2", title: "Already booked" },
        ],
        {
          templateId: "template-1",
          templateName: "Camera cart",
          availableAssets: [
            { id: "asset-2", title: "Already booked" },
            { id: "asset-3", title: "New from template" },
          ],
          unavailableAssets: [{ id: "asset-4", title: "Unavailable" }],
          missingAssets: [{ id: "asset-5", title: "Missing" }],
        }
      )
    ).toEqual({
      nextSelectedBulkItems: [
        { id: "asset-1", title: "Already selected" },
        { id: "asset-2", title: "Already booked" },
        { id: "asset-3", title: "New from template" },
      ],
      templateApplySummary: {
        templateId: "template-1",
        templateName: "Camera cart",
        availableAssets: [{ id: "asset-3", title: "New from template" }],
        unavailableAssets: [{ id: "asset-4", title: "Unavailable" }],
        missingAssets: [{ id: "asset-5", title: "Missing" }],
      },
    });
  });
});

describe("buildLastUserMap", () => {
  it("prefers the newest booking per asset and formats users consistently", () => {
    const result = buildLastUserMap([
      {
        id: "booking-new",
        assets: [{ id: "asset-1" }, { id: "asset-2" }],
        custodianUser: {
          displayName: "Scout User",
          firstName: "Ignored",
          lastName: "Name",
        },
        custodianTeamMember: null,
      },
      {
        id: "booking-old",
        assets: [{ id: "asset-1" }, { id: "asset-3" }],
        custodianUser: null,
        custodianTeamMember: {
          name: "Camera Team",
          user: null,
        },
      },
    ]);

    expect(result).toEqual({
      "asset-1": { bookingId: "booking-new", name: "Scout User" },
      "asset-2": { bookingId: "booking-new", name: "Scout User" },
      "asset-3": { bookingId: "booking-old", name: "Camera Team" },
    });
  });

  it("uses linked team member user names when available", () => {
    const result = buildLastUserMap([
      {
        id: "booking-1",
        assets: [{ id: "asset-9" }],
        custodianUser: null,
        custodianTeamMember: {
          name: "Fallback Name",
          user: {
            displayName: null,
            firstName: "Jamie",
            lastName: "Rivera",
          },
        },
      },
    ]);

    expect(result["asset-9"]).toEqual({
      bookingId: "booking-1",
      name: "Jamie Rivera",
    });
  });
});

describe("manage-assets route validation", () => {
  const mockUser = {
    id: "user123",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockBooking = {
    id: "booking123",
    name: "Test Booking",
    status: BookingStatus.ONGOING,
    assets: [
      { id: "asset1", title: "Asset 1", sequentialId: "AST-001" },
      { id: "asset2", title: "Asset 2", sequentialId: "AST-002" },
    ],
    from: new Date(),
    to: new Date(),
    organizationId: "org123",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.formData = () => Promise.resolve(new FormData());
    vi.mocked(httpServer.getCurrentSearchParams).mockReturnValue(
      new URLSearchParams()
    );
    vi.mocked(assetUtils.getAssetsWhereInput).mockReturnValue({
      organizationId: "org123",
    } as any);

    // Setup default mocks
    vi.mocked(rolesServer.requirePermission).mockResolvedValue({
      organizationId: "org123",
      isSelfServiceOrBase: false,
      organizations: [],
      currentOrganization: {} as any,
      role: {} as any,
      userOrganizations: [],
      canSeeAllBookings: false,
      canSeeAllCustody: false,
      canUseBarcodes: false,
      canUseAudits: false,
    });

    vi.mocked(httpServer.getParams).mockReturnValue({
      bookingId: "booking123",
    });

    vi.mocked(userService.getUserByID).mockResolvedValue(mockUser);
    vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue(mockBooking);
    vi.mocked(db.asset.findFirst).mockResolvedValue({ id: "asset1" } as any);
    vi.mocked(bookingService.getDetailedPartialCheckinData).mockResolvedValue({
      checkedInAssetIds: [],
      partialCheckinDetails: {},
    });
    vi.mocked(bookingService.updateBookingAssets).mockResolvedValue({
      id: "booking123",
      name: "Test Booking",
      status: BookingStatus.ONGOING,
    });
    vi.mocked(noteService.createNotes).mockResolvedValue({ count: 0 });
    vi.mocked(bookingService.removeAssets).mockResolvedValue({} as any);
  });

  describe("favorite actions", () => {
    it("should create a favorite for the current user", async () => {
      const formData = new FormData();
      formData.set("intent", "toggle-favorite");
      formData.set("assetId", "asset1");
      formData.set("isFavorite", "true");
      mockRequest.formData = () => Promise.resolve(formData);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      expect(db.assetFavorite.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_ownerId_assetId: {
            organizationId: "org123",
            ownerId: "user123",
            assetId: "asset1",
          },
        },
        update: {},
        create: {
          organizationId: "org123",
          ownerId: "user123",
          assetId: "asset1",
        },
      });
      expect(response).toMatchObject({
        intent: "toggle-favorite",
        assetId: "asset1",
        isFavorite: true,
      });
    });

    it("should remove a favorite for the current user", async () => {
      const formData = new FormData();
      formData.set("intent", "toggle-favorite");
      formData.set("assetId", "asset1");
      formData.set("isFavorite", "false");
      mockRequest.formData = () => Promise.resolve(formData);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      expect(db.assetFavorite.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org123",
          ownerId: "user123",
          assetId: "asset1",
        },
      });
      expect(response).toMatchObject({
        intent: "toggle-favorite",
        assetId: "asset1",
        isFavorite: false,
      });
    });
  });

  describe("template actions", () => {
    it("returns template application payload without redirecting", async () => {
      const formData = new FormData();
      formData.set("intent", "apply-template");
      mockRequest.formData = () => Promise.resolve(formData);

      vi.mocked(httpServer.parseData).mockReturnValue({
        templateId: "template-1",
      } as any);
      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue({
        id: "booking123",
        status: BookingStatus.DRAFT,
      } as any);
      vi.mocked(bookingTemplateService.applyBookingTemplate).mockResolvedValue({
        templateId: "template-1",
        templateName: "Camera cart",
        availableAssets: [
          { id: "asset-1", title: "Body", sequentialId: null, kitId: null },
        ],
        unavailableAssets: [],
        missingAssets: [],
      });

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      expect(response).toEqual({
        error: null,
        intent: "apply-template",
        templateApplication: {
          templateId: "template-1",
          templateName: "Camera cart",
          availableAssets: [
            { id: "asset-1", title: "Body", sequentialId: null, kitId: null },
          ],
          unavailableAssets: [],
          missingAssets: [],
        },
      });
    });

    it("rejects apply-template direct posts for disallowed booking statuses", async () => {
      const formData = new FormData();
      formData.set("intent", "apply-template");
      mockRequest.formData = () => Promise.resolve(formData);

      vi.mocked(httpServer.parseData).mockReturnValue({
        templateId: "template-1",
      } as any);
      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
      } as any);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
      expect(
        bookingTemplateService.applyBookingTemplate
      ).not.toHaveBeenCalled();
    });

    it("rejects create-template direct posts for self-service users on non-draft bookings", async () => {
      const formData = new FormData();
      formData.set("intent", "create-template");
      mockRequest.formData = () => Promise.resolve(formData);

      vi.mocked(rolesServer.requirePermission).mockResolvedValue({
        organizationId: "org123",
        isSelfServiceOrBase: true,
        organizations: [],
        currentOrganization: {} as any,
        role: {} as any,
        userOrganizations: [],
        canSeeAllBookings: false,
        canSeeAllCustody: false,
        canUseBarcodes: false,
        canUseAudits: false,
      });
      vi.mocked(httpServer.parseData).mockReturnValue({
        name: "Camera cart",
      } as any);
      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.RESERVED,
      } as any);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
      expect(
        bookingTemplateService.createBookingTemplate
      ).not.toHaveBeenCalled();
    });

    it("creates a template from persisted non-kit booking assets", async () => {
      const formData = new FormData();
      formData.set("intent", "create-template");
      mockRequest.formData = () => Promise.resolve(formData);

      vi.mocked(httpServer.parseData).mockReturnValue({
        name: "Camera cart",
      } as any);
      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue({
        assets: [{ id: "asset-1", title: "Body", sequentialId: "CAM-001" }],
      } as any);
      vi.mocked(bookingTemplateService.createBookingTemplate).mockResolvedValue(
        {
          id: "template-1",
          name: "Camera cart",
          items: [
            { assetId: "asset-1", title: "Body", sequentialId: "CAM-001" },
          ],
        } as any
      );

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      expect(bookingTemplateService.createBookingTemplate).toHaveBeenCalledWith(
        {
          organizationId: "org123",
          ownerId: "user123",
          name: "Camera cart",
          items: [
            { assetId: "asset-1", title: "Body", sequentialId: "CAM-001" },
          ],
        }
      );
      expect(response).toEqual({
        error: null,
        intent: "create-template",
        createdTemplate: {
          id: "template-1",
          name: "Camera cart",
          itemCount: 1,
        },
      });
    });
  });

  describe("validation scope - only newly added assets", () => {
    it("expands ALL_SELECTED_KEY using the current filtered asset query", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["all-selected"],
        removedAssetIds: ["asset4"],
        redirectTo: null,
      });
      vi.mocked(httpServer.getCurrentSearchParams).mockReturnValue(
        new URLSearchParams("favoritesOnly=true&search=sony")
      );
      vi.mocked(assetUtils.getAssetsWhereInput).mockReturnValue({
        organizationId: "org123",
        assetFavorites: {
          some: {
            organizationId: "org123",
            ownerId: "user123",
          },
        },
      } as any);
      vi.mocked(db.asset.findMany)
        .mockResolvedValueOnce([
          { id: "asset1" },
          { id: "asset3" },
          { id: "asset4" },
        ] as any)
        .mockResolvedValueOnce([{ id: "asset2" }] as any)
        .mockResolvedValueOnce([] as any);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      expect(httpServer.getCurrentSearchParams).toHaveBeenCalledWith(
        mockRequest
      );
      expect(assetUtils.getAssetsWhereInput).toHaveBeenCalledWith({
        organizationId: "org123",
        currentSearchParams: "favoritesOnly=true&search=sony",
        userId: "user123",
      });
      expect(bookingService.updateBookingAssets).toHaveBeenCalledWith({
        id: "booking123",
        organizationId: "org123",
        assetIds: ["asset3"],
        userId: "user123",
      });
      expect(response).toBeInstanceOf(Response);
    });

    it("should only validate assets that are NEW to the booking", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "asset4", // new asset
          title: "Asset 4",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3", "asset4"], // asset1,2 existing, asset3,4 new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      // Should return error response for checked out assets
      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);

      // Should only validate newly added assets (asset3, asset4)
      expect(bookingAssets.isAssetPartiallyCheckedIn).toHaveBeenCalledTimes(2);
      expect(bookingAssets.isAssetPartiallyCheckedIn).toHaveBeenCalledWith(
        mockAssets[0],
        {},
        BookingStatus.ONGOING
      );
      expect(bookingAssets.isAssetPartiallyCheckedIn).toHaveBeenCalledWith(
        mockAssets[1],
        {},
        BookingStatus.ONGOING
      );
    });

    it("should not validate assets that already exist in the booking", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2"], // all existing assets
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue([]);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should succeed without validation since no new assets
      await expect(
        actionFunction(
          createActionArgs({
            context: mockContext,
            request: mockRequest,
            params: mockParams,
          })
        )
      ).resolves.not.toThrow();

      // Should not call validation helper since no newly added assets
      expect(bookingAssets.isAssetPartiallyCheckedIn).not.toHaveBeenCalled();
    });
  });

  describe("context-aware validation", () => {
    it("should allow assets that are partially checked in within booking context", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      const mockPartialCheckinDetails = {
        asset3: {
          checkinDate: new Date("2023-01-01"),
          checkedInBy: {
            id: "user123",
            firstName: "John",
            lastName: "Doe",
            profilePicture: null,
          },
        },
      };

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingService.getDetailedPartialCheckinData).mockResolvedValue(
        {
          checkedInAssetIds: ["asset3"],
          partialCheckinDetails: mockPartialCheckinDetails,
        }
      );

      // Mock that asset is partially checked in (available for other bookings)
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(true);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should succeed because asset is partially checked in within booking context
      await expect(
        actionFunction(
          createActionArgs({
            context: mockContext,
            request: mockRequest,
            params: mockParams,
          })
        )
      ).resolves.not.toThrow();

      expect(bookingAssets.isAssetPartiallyCheckedIn).toHaveBeenCalledWith(
        mockAssets[0],
        mockPartialCheckinDetails,
        BookingStatus.ONGOING
      );
    });

    it("should block assets that are truly checked out (not partially checked in)", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);

      // Mock that asset is NOT partially checked in (truly checked out)
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should return error response because asset is truly checked out
      const response = await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
    });

    it("should allow available assets regardless of partial check-in status", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue([]);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should succeed because asset status is AVAILABLE
      await expect(
        actionFunction(
          createActionArgs({
            context: mockContext,
            request: mockRequest,
            params: mockParams,
          })
        )
      ).resolves.not.toThrow();

      // Should not call validation helper since asset is available
      expect(bookingAssets.isAssetPartiallyCheckedIn).not.toHaveBeenCalled();
    });
  });

  describe("booking status validation", () => {
    it("should only validate for ONGOING and OVERDUE bookings", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      // Test with DRAFT booking - should not validate
      const draftBooking = { ...mockBooking, status: BookingStatus.DRAFT };

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue(draftBooking);
      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should succeed because DRAFT bookings allow checked out assets
      await expect(
        actionFunction(
          createActionArgs({
            context: mockContext,
            request: mockRequest,
            params: mockParams,
          })
        )
      ).resolves.not.toThrow();
    });

    it("should validate for ONGOING bookings", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      // Test with ONGOING booking - should validate
      const ongoingBooking = { ...mockBooking, status: BookingStatus.ONGOING };

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue(ongoingBooking);
      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should return error response because ONGOING booking validates checked out assets
      const response = await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
    });

    it("should validate for OVERDUE bookings", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      // Test with OVERDUE booking - should validate
      const overdueBooking = { ...mockBooking, status: BookingStatus.OVERDUE };

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.booking.findUniqueOrThrow).mockResolvedValue(overdueBooking);
      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      // Should return error response because OVERDUE booking validates checked out assets
      const response = await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
    });
  });

  describe("integration with centralized helpers", () => {
    it("should pass correct parameters to isAssetPartiallyCheckedIn helper", async () => {
      const mockAssets = [
        {
          id: "asset3", // new asset
          title: "Asset 3",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      const mockPartialCheckinDetails = {
        asset3: {
          checkinDate: new Date("2023-01-01"),
          checkedInBy: {
            id: "user123",
            firstName: "John",
            lastName: "Doe",
            profilePicture: null,
          },
        },
      };

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingService.getDetailedPartialCheckinData).mockResolvedValue(
        {
          checkedInAssetIds: ["asset3"],
          partialCheckinDetails: mockPartialCheckinDetails,
        }
      );
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(true);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      // Verify helper is called with correct parameters
      expect(bookingAssets.isAssetPartiallyCheckedIn).toHaveBeenCalledWith(
        mockAssets[0],
        mockPartialCheckinDetails,
        BookingStatus.ONGOING
      );
    });
  });

  describe("asset management operations", () => {
    it("should handle asset addition and note creation", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3"], // asset3 is new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue([]);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      // Verify updateBookingAssets is called with new assets only
      expect(bookingService.updateBookingAssets).toHaveBeenCalledWith({
        id: "booking123",
        organizationId: "org123",
        assetIds: ["asset3"], // only the new asset
        userId: "user123",
      });

      // Verify note creation for new assets
      expect(noteService.createNotes).toHaveBeenCalledWith({
        content:
          '{% link to="/settings/team/users/user123" text="John Doe" /%} added asset to {% link to="/bookings/booking123" text="Test Booking" /%}.',
        type: "UPDATE",
        userId: "user123",
        assetIds: ["asset3"], // only the new asset
      });
    });

    it("should handle asset removal", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1"], // asset2 removed
        removedAssetIds: ["asset2"],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue([]);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      // Verify removeAssets is called
      expect(bookingService.removeAssets).toHaveBeenCalledWith({
        booking: { id: "booking123", assetIds: ["asset2"] },
        firstName: "John",
        lastName: "Doe",
        userId: "user123",
        organizationId: "org123",
        assets: [],
      });
    });

    it("should not update booking when no new assets are added", async () => {
      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2"], // no new assets
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue([]);

      const { action: actionFunction } = await import(
        "./bookings.$bookingId.overview.manage-assets"
      );

      await actionFunction(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      // Should not call updateBookingAssets when no new assets
      expect(bookingService.updateBookingAssets).not.toHaveBeenCalled();
      expect(noteService.createNotes).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should provide descriptive error messages for checked out assets", async () => {
      const mockAssets = [
        {
          id: "asset3",
          title: "Laptop Dell",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "asset4",
          title: "Monitor Samsung",
          status: AssetStatus.CHECKED_OUT,
          organizationId: "org123",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any;

      vi.mocked(httpServer.parseData).mockReturnValue({
        assetIds: ["asset1", "asset2", "asset3", "asset4"], // asset3,4 are new
        removedAssetIds: [],
        redirectTo: null,
      });

      vi.mocked(db.asset.findMany).mockResolvedValue(mockAssets);
      vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

      const response = await action(
        createActionArgs({
          context: mockContext,
          request: mockRequest,
          params: mockParams,
        })
      );

      assertIsDataWithResponseInit(response);
      expect(response.init?.status).toBe(500);
    });
  });
});
