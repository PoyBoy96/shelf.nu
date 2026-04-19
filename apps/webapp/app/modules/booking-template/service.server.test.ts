import { AssetStatus, BookingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/database/db.server";
import * as bookingService from "~/modules/booking/service.server";
import * as bookingAssets from "~/utils/booking-assets";

import {
  applyBookingTemplate,
  createBookingTemplate,
  listBookingTemplatesForUser,
  parseTemplateItems,
} from "./service.server";

// @vitest-environment node

vi.mock("~/database/db.server", () => ({
  db: {
    $transaction: vi.fn(),
    asset: {
      findMany: vi.fn(),
    },
    bookingTemplate: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("~/modules/booking/service.server", () => ({
  getDetailedPartialCheckinData: vi.fn(),
}));

vi.mock("~/utils/booking-assets", () => ({
  isAssetPartiallyCheckedIn: vi.fn(),
}));

describe("booking-template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists templates with parsed items", async () => {
    vi.mocked(db.bookingTemplate.findMany).mockResolvedValue([
      {
        id: "template-1",
        organizationId: "org-1",
        ownerId: "user-1",
        name: "Camera cart",
        itemsJson: [
          { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const result = await listBookingTemplatesForUser({
      organizationId: "org-1",
      ownerId: "user-1",
    });

    expect(db.bookingTemplate.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", ownerId: "user-1" },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });
    expect(result[0].items).toEqual([
      { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
    ]);
  });

  it("creates a deduplicated template", async () => {
    vi.mocked(db.$transaction).mockImplementation((callback: any) =>
      callback({
        bookingTemplate: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "template-1",
            organizationId: "org-1",
            ownerId: "user-1",
            name: "Camera cart",
            itemsJson: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      })
    );

    const result = await createBookingTemplate({
      organizationId: "org-1",
      ownerId: "user-1",
      name: "  Camera cart  ",
      items: [
        { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
        { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
        { assetId: "asset-2", title: "Tripod", sequentialId: null },
      ],
    });

    expect(result.name).toBe("Camera cart");
    expect(result.items).toEqual([
      { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
      { assetId: "asset-2", title: "Tripod", sequentialId: null },
    ]);
  });

  it("applies a template, separating available, unavailable, and missing assets", async () => {
    vi.mocked(db.bookingTemplate.findFirst).mockResolvedValue({
      id: "template-1",
      organizationId: "org-1",
      ownerId: "user-1",
      name: "Camera cart",
      itemsJson: [
        { assetId: "asset-1", title: "Sony A7S", sequentialId: "CAM-001" },
        { assetId: "asset-2", title: "Tripod", sequentialId: "TRI-001" },
        { assetId: "asset-3", title: "Light", sequentialId: "LGT-001" },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    vi.mocked(bookingService.getDetailedPartialCheckinData).mockResolvedValue({
      checkedInAssetIds: [],
      partialCheckinDetails: {},
    });
    vi.mocked(db.asset.findMany).mockResolvedValue([
      {
        id: "asset-1",
        title: "Sony A7S",
        sequentialId: "CAM-001",
        availableToBook: true,
        kitId: null,
        status: AssetStatus.AVAILABLE,
      },
      {
        id: "asset-2",
        title: "Tripod",
        sequentialId: "TRI-001",
        availableToBook: false,
        kitId: null,
        status: AssetStatus.AVAILABLE,
      },
    ] as any);
    vi.mocked(bookingAssets.isAssetPartiallyCheckedIn).mockReturnValue(false);

    const result = await applyBookingTemplate({
      templateId: "template-1",
      organizationId: "org-1",
      ownerId: "user-1",
      bookingId: "booking-1",
      bookingStatus: BookingStatus.DRAFT,
    });

    expect(result.availableAssets).toEqual([
      {
        id: "asset-1",
        title: "Sony A7S",
        sequentialId: "CAM-001",
        kitId: null,
      },
    ]);
    expect(result.unavailableAssets).toEqual([
      {
        assetId: "asset-2",
        title: "Tripod",
        sequentialId: "TRI-001",
        reason: "Unavailable for booking",
      },
    ]);
    expect(result.missingAssets).toEqual([
      {
        assetId: "asset-3",
        title: "Light",
        sequentialId: "LGT-001",
      },
    ]);
  });

  it("parses invalid template payloads defensively", () => {
    expect(parseTemplateItems({ foo: "bar" } as any)).toEqual([]);
    expect(
      parseTemplateItems([
        { assetId: "asset-1", title: "Body", sequentialId: "CAM-001" },
        { assetId: 42, title: "bad" },
      ] as any)
    ).toEqual([{ assetId: "asset-1", title: "Body", sequentialId: "CAM-001" }]);
  });
});
