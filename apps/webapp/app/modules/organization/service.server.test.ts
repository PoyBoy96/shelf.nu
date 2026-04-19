import { OrganizationRoles, OrganizationType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  getUserActiveSubscriptionsMock,
  stripeSubscriptionsCancelMock,
  stripeSubscriptionsUpdateMock,
} = vi.hoisted(() => {
  const tx = {
    userOrganization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    organization: {
      count: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    dbMock: {
      tx,
      $transaction: vi.fn((callback) => callback(tx)),
    },
    getUserActiveSubscriptionsMock: vi.fn(),
    stripeSubscriptionsCancelMock: vi.fn(),
    stripeSubscriptionsUpdateMock: vi.fn(),
  };
});

// why: tests exercise service branching without touching the real database
vi.mock("~/database/db.server", () => ({
  db: dbMock,
}));

// why: workspace deletion billing shutdown must not call Stripe in unit tests
vi.mock("~/utils/stripe.server", () => ({
  getUserActiveSubscription: vi.fn(),
  getUserActiveSubscriptions: getUserActiveSubscriptionsMock,
  premiumIsEnabled: true,
  stripe: {
    subscriptions: {
      update: stripeSubscriptionsUpdateMock,
      cancel: stripeSubscriptionsCancelMock,
    },
  },
  createStripeCustomer: vi.fn(),
  customerHasPaymentMethod: vi.fn(),
  transferSubscriptionToCustomer: vi.fn(),
}));

// why: deletion billing follow-up emails should not send during tests
vi.mock("~/emails/mail.server", () => ({
  sendEmail: vi.fn(),
}));

const {
  requestWorkspaceDeletion,
  shouldCancelOwnerTierSubscriptionsOnWorkspaceDeletion,
} = await import("./service.server");

describe("shouldCancelOwnerTierSubscriptionsOnWorkspaceDeletion", () => {
  it("returns true when deleting the owner's last active team workspace", () => {
    expect(
      shouldCancelOwnerTierSubscriptionsOnWorkspaceDeletion({
        workspaceType: OrganizationType.TEAM,
        ownerHasOtherActiveTeamWorkspaces: false,
      })
    ).toBe(true);
  });

  it("returns false when the owner still has another active team workspace", () => {
    expect(
      shouldCancelOwnerTierSubscriptionsOnWorkspaceDeletion({
        workspaceType: OrganizationType.TEAM,
        ownerHasOtherActiveTeamWorkspaces: true,
      })
    ).toBe(false);
  });

  it("returns false for personal workspace deletion", () => {
    expect(
      shouldCancelOwnerTierSubscriptionsOnWorkspaceDeletion({
        workspaceType: OrganizationType.PERSONAL,
        ownerHasOtherActiveTeamWorkspaces: false,
      })
    ).toBe(false);
  });
});

describe("requestWorkspaceDeletion", () => {
  const now = new Date("2026-04-15T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.tx.organization.count.mockResolvedValue(0);
    getUserActiveSubscriptionsMock.mockResolvedValue([]);
  });

  it("rejects actors who are not workspace owners", async () => {
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.ADMIN],
      organization: {
        id: "org_1",
        name: "Team",
        type: OrganizationType.TEAM,
        userId: "owner_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });

    await expect(
      requestWorkspaceDeletion({
        organizationId: "org_1",
        actorUserId: "user_1",
        now,
      })
    ).rejects.toThrow("Only workspace owners can delete a workspace.");

    expect(dbMock.tx.organization.update).not.toHaveBeenCalled();
  });

  it("requires another active workspace for fallback", async () => {
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org_1",
        name: "Team",
        type: OrganizationType.TEAM,
        userId: "user_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    dbMock.tx.userOrganization.findFirst.mockResolvedValue(null);

    await expect(
      requestWorkspaceDeletion({
        organizationId: "org_1",
        actorUserId: "user_1",
        now,
      })
    ).rejects.toThrow(
      "You need to belong to another active workspace before deleting this one."
    );

    expect(dbMock.tx.organization.update).not.toHaveBeenCalled();
  });

  it("archives the workspace and schedules deletion 30 days later", async () => {
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org_1",
        name: "Team",
        type: OrganizationType.TEAM,
        userId: "user_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    dbMock.tx.userOrganization.findFirst.mockResolvedValue({
      organizationId: "org_fallback",
    });

    const result = await requestWorkspaceDeletion({
      organizationId: "org_1",
      actorUserId: "user_1",
      now,
    });

    expect(result.fallbackOrganizationId).toBe("org_fallback");
    expect(result.deletionScheduledFor.toISOString()).toBe(
      "2026-05-15T12:00:00.000Z"
    );
    expect(dbMock.tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: expect.objectContaining({
        archivedAt: now,
        deletionRequestedAt: now,
        deletionRequestedById: "user_1",
        deletionScheduledFor: result.deletionScheduledFor,
        barcodesEnabled: false,
        auditsEnabled: false,
      }),
    });
  });

  it("cancels tier and addon subscriptions when deleting the last active team workspace", async () => {
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org_1",
        name: "Team",
        type: OrganizationType.TEAM,
        userId: "user_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    dbMock.tx.userOrganization.findFirst.mockResolvedValue({
      organizationId: "org_fallback",
    });
    getUserActiveSubscriptionsMock.mockResolvedValue([
      {
        id: "sub_tier",
        metadata: {},
        items: {
          data: [
            {
              price: {
                product: {
                  metadata: { shelf_tier: "tier_2" },
                },
              },
            },
          ],
        },
      },
      {
        id: "sub_addon",
        metadata: { organizationId: "org_1" },
        items: {
          data: [
            {
              price: {
                product: {
                  metadata: { product_type: "addon" },
                },
              },
            },
          ],
        },
      },
    ]);

    await requestWorkspaceDeletion({
      organizationId: "org_1",
      actorUserId: "user_1",
      now,
    });

    expect(stripeSubscriptionsCancelMock).toHaveBeenCalledTimes(2);
    expect(stripeSubscriptionsCancelMock).toHaveBeenNthCalledWith(
      1,
      "sub_tier",
      { prorate: false }
    );
    expect(stripeSubscriptionsCancelMock).toHaveBeenNthCalledWith(
      2,
      "sub_addon",
      { prorate: false }
    );
    expect(stripeSubscriptionsUpdateMock).toHaveBeenNthCalledWith(
      1,
      "sub_tier",
      {
        metadata: expect.objectContaining({
          workspace_deletion_requested: "true",
          workspace_last_team_deletion_requested: "true",
          deleted_organization_id: "org_1",
        }),
      }
    );
  });

  it("does not cancel tier subscriptions when the owner still has another active team workspace", async () => {
    dbMock.tx.organization.count.mockResolvedValue(1);
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org_1",
        name: "Team",
        type: OrganizationType.TEAM,
        userId: "user_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    dbMock.tx.userOrganization.findFirst.mockResolvedValue({
      organizationId: "org_fallback",
    });
    getUserActiveSubscriptionsMock.mockResolvedValue([
      {
        id: "sub_tier",
        metadata: {},
        items: {
          data: [
            {
              price: {
                product: {
                  metadata: { shelf_tier: "tier_2" },
                },
              },
            },
          ],
        },
      },
      {
        id: "sub_addon",
        metadata: { organizationId: "org_1" },
        items: {
          data: [
            {
              price: {
                product: {
                  metadata: { product_type: "addon" },
                },
              },
            },
          ],
        },
      },
    ]);

    await requestWorkspaceDeletion({
      organizationId: "org_1",
      actorUserId: "user_1",
      now,
    });

    expect(stripeSubscriptionsCancelMock).toHaveBeenCalledTimes(1);
    expect(stripeSubscriptionsCancelMock).toHaveBeenCalledWith("sub_addon", {
      prorate: false,
    });
    expect(stripeSubscriptionsUpdateMock).toHaveBeenCalledWith("sub_addon", {
      metadata: expect.objectContaining({
        workspace_deletion_requested: "true",
      }),
    });
  });

  it("does not cancel tier subscriptions when deleting a personal workspace", async () => {
    dbMock.tx.userOrganization.findUnique.mockResolvedValue({
      roles: [OrganizationRoles.OWNER],
      organization: {
        id: "org_1",
        name: "Personal",
        type: OrganizationType.PERSONAL,
        userId: "user_1",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });
    dbMock.tx.userOrganization.findFirst.mockResolvedValue({
      organizationId: "org_fallback",
    });
    getUserActiveSubscriptionsMock.mockResolvedValue([
      {
        id: "sub_tier",
        metadata: {},
        items: {
          data: [
            {
              price: {
                product: {
                  metadata: { shelf_tier: "tier_1" },
                },
              },
            },
          ],
        },
      },
    ]);

    await requestWorkspaceDeletion({
      organizationId: "org_1",
      actorUserId: "user_1",
      now,
    });

    expect(stripeSubscriptionsCancelMock).not.toHaveBeenCalled();
  });
});
