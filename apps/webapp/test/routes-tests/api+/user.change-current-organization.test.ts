import { createActionArgs } from "@mocks/remix";
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
    $executeRaw: vi.fn(),
  },
}));

vi.mock("~/modules/organization/context.server", () => ({
  setSelectedOrganizationIdCookie: vi.fn(),
}));

vi.mock("~/utils/cookies.server", () => ({
  setCookie: vi.fn((value: string) => ["Set-Cookie", value]),
}));

import { db } from "~/database/db.server";
import { setSelectedOrganizationIdCookie } from "~/modules/organization/context.server";
import { action } from "~/routes/api+/user.change-current-organization";

const dbMock = db as unknown as {
  userOrganization: { findUnique: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
};
const setSelectedOrganizationIdCookieMock = vi.mocked(
  setSelectedOrganizationIdCookie
);

describe("api+/user.change-current-organization action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectedOrganizationIdCookieMock.mockResolvedValue("organization=org-2");
    dbMock.$executeRaw.mockResolvedValue(undefined);
  });

  it("blocks switching into a workspace scheduled for deletion", async () => {
    dbMock.userOrganization.findUnique.mockResolvedValue({
      id: "membership-1",
      user: { sso: false },
      organization: {
        type: "TEAM",
        archivedAt: null,
        deletionScheduledFor: new Date("2026-04-15T18:00:00.000Z"),
      },
    });

    const formData = new FormData();
    formData.set("organizationId", "org-2");

    const response = (await action(
      createActionArgs({
        context: { getSession: () => ({ userId: "user-1" }) },
        request: new Request(
          "https://example.com/api/user/change-current-organization",
          {
            method: "POST",
            body: formData,
          }
        ),
      })
    )) as Response;

    expect(response.status).toBe(403);
    expect(dbMock.$executeRaw).not.toHaveBeenCalled();
    expect(setSelectedOrganizationIdCookieMock).not.toHaveBeenCalled();
  });

  it("persists the new workspace and redirects when it is active", async () => {
    dbMock.userOrganization.findUnique.mockResolvedValue({
      id: "membership-1",
      user: { sso: false },
      organization: {
        type: "TEAM",
        archivedAt: null,
        deletionScheduledFor: null,
      },
    });

    const formData = new FormData();
    formData.set("organizationId", "org-2");
    formData.set("redirectTo", "/assets");

    const response = (await action(
      createActionArgs({
        context: { getSession: () => ({ userId: "user-1" }) },
        request: new Request(
          "https://example.com/api/user/change-current-organization",
          {
            method: "POST",
            body: formData,
          }
        ),
      })
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/assets");
    expect(dbMock.$executeRaw).toHaveBeenCalledOnce();
    expect(setSelectedOrganizationIdCookieMock).toHaveBeenCalledWith("org-2");
  });
});
