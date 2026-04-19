import { createLoaderArgs } from "@mocks/remix";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createDataMock = vi.hoisted(() => {
  return () =>
    vi.fn(
      (payload: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(payload), {
          status: init?.status || 200,
          headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
          },
        })
    );
});

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    data: createDataMock(),
  };
});

vi.mock("~/database/db.server", () => ({
  db: {
    userOrganization: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/utils/csv.server", () => ({
  exportAssetsBackupToCsv: vi.fn(),
}));

import { OrganizationRoles } from "@prisma/client";
import { db } from "~/database/db.server";
import { loader } from "~/routes/_layout+/account-details.workspace.$workspaceId.assets-export[.csv]";
import { exportAssetsBackupToCsv } from "~/utils/csv.server";

const dbMock = db as unknown as {
  userOrganization: { findUnique: ReturnType<typeof vi.fn> };
};
const exportAssetsBackupToCsvMock = vi.mocked(exportAssetsBackupToCsv);

describe("account-details workspace assets export loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a CSV download for active owner workspaces", async () => {
    dbMock.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org-1",
        name: "Camera Team",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    exportAssetsBackupToCsvMock.mockResolvedValue("Name\nLens\n");

    const response = (await loader(
      createLoaderArgs({
        context: { getSession: () => ({ userId: "user-1" }) },
        params: { workspaceId: "org-1" },
      })
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "Camera Team-assets.csv"
    );
    expect(await response.text()).toBe("Name\nLens\n");
    expect(exportAssetsBackupToCsvMock).toHaveBeenCalledWith({
      organizationId: "org-1",
    });
  });

  it("blocks exports for workspaces already scheduled for deletion", async () => {
    dbMock.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org-1",
        name: "Camera Team",
        archivedAt: null,
        deletionScheduledFor: new Date("2026-04-15T18:00:00.000Z"),
      },
    });

    const response = (await loader(
      createLoaderArgs({
        context: { getSession: () => ({ userId: "user-1" }) },
        params: { workspaceId: "org-1" },
      })
    )) as Response;

    expect(response.status).toBe(403);
    expect(exportAssetsBackupToCsvMock).not.toHaveBeenCalled();
  });
});
