import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserOrganizationsMock } = vi.hoisted(() => ({
  getUserOrganizationsMock: vi.fn(),
}));

vi.mock("@server/request-cache.server", () => ({
  getRequestCache: vi.fn(() => null),
}));

// why: context resolution is tested with controlled memberships, not database calls
vi.mock("./service.server", () => ({
  getUserOrganizations: getUserOrganizationsMock,
}));

const { getSelectedOrganization } = await import("./context.server");

function makeMembership({
  organization,
  sso = false,
}: {
  organization: Record<string, unknown>;
  sso?: boolean;
}) {
  return {
    organizationId: organization.id,
    roles: ["OWNER"],
    organization,
    user: { lastSelectedOrganizationId: null, sso },
  };
}

describe("getSelectedOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes archived and deleting workspaces from resolution", async () => {
    const archivedOrganization = {
      id: "org_archived",
      type: "PERSONAL",
      archivedAt: new Date("2026-04-15T12:00:00.000Z"),
      deletionScheduledFor: null,
    };
    const deletingOrganization = {
      id: "org_deleting",
      type: "TEAM",
      archivedAt: null,
      deletionScheduledFor: new Date("2026-05-15T12:00:00.000Z"),
    };
    const activeOrganization = {
      id: "org_active",
      type: "TEAM",
      archivedAt: null,
      deletionScheduledFor: null,
    };

    getUserOrganizationsMock.mockResolvedValue([
      makeMembership({ organization: archivedOrganization }),
      makeMembership({ organization: deletingOrganization }),
      makeMembership({ organization: activeOrganization }),
    ]);

    const selected = await getSelectedOrganization({
      userId: "user_1",
      request: new Request("https://example.com/assets"),
    });

    expect(selected.organizationId).toBe("org_active");
    expect(selected.organizations).toEqual([activeOrganization]);
    expect(selected.currentOrganization).toBe(activeOrganization);
  });
});
