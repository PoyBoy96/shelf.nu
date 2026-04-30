// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";

const createDataMock = vi.hoisted(() => {
  return () =>
    vi.fn((data: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
    });
});

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    data: createDataMock(),
  };
});

vi.mock("~/modules/auth/service.server", () => ({
  OTP_REQUEST_MODES: ["login", "signup", "confirm_signup"],
  verifyOtpAndSignin: vi.fn(),
}));

vi.mock("~/modules/user/service.server", () => ({
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock("~/modules/user/utils.server", () => ({
  generateUniqueUsername: vi.fn(),
}));

vi.mock("~/modules/organization/context.server", () => ({
  getSelectedOrganization: vi.fn(),
  setSelectedOrganizationIdCookie: vi.fn(),
}));

vi.mock("~/utils/cookies.server", () => ({
  setCookie: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/otp");
const { verifyOtpAndSignin } = await import("~/modules/auth/service.server");
const { createUser, findUserByEmail } = await import(
  "~/modules/user/service.server"
);

function buildRequest() {
  return new Request("https://example.com/otp?mode=login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: "user@example.com",
      otp: "123456",
    }),
  });
}

describe("otp action login guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(verifyOtpAndSignin).mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 60_000),
    } as any);
    vi.mocked(findUserByEmail).mockResolvedValue(null);
  });

  it("does not auto-provision a user from login mode", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(),
        context: {
          setSession: vi.fn(),
        },
      })
    )) as Response;

    expect(response.status).toBe(404);
    expect(createUser).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error.message).toBe(
      "No Shelf account found for this email. Sign up instead."
    );
  });
});
