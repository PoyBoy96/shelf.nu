// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";

vi.mock("~/modules/auth/service.server", () => ({
  sendOTP: vi.fn(),
}));

vi.mock("~/utils/sso.server", () => ({
  validateNonSSOSignup: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/send-otp");
const { sendOTP } = await import("~/modules/auth/service.server");
const { validateNonSSOSignup } = await import("~/utils/sso.server");

function buildRequest(body: URLSearchParams) {
  return new Request("https://example.com/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("send-otp action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses login mode by default when mode is missing", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({ email: "user@example.com" })
        ),
      })
    )) as Response;

    expect(sendOTP).toHaveBeenCalledWith("user@example.com", "login");
    expect(validateNonSSOSignup).not.toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/otp?email=user%40example.com&mode=login"
    );
  });

  it("passes signup mode through and validates SSO before sending", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            email: "user@example.com",
            mode: "signup",
          })
        ),
      })
    )) as Response;

    expect(validateNonSSOSignup).toHaveBeenCalledWith("user@example.com");
    expect(sendOTP).toHaveBeenCalledWith("user@example.com", "signup");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/otp?email=user%40example.com&mode=signup"
    );
  });
});
