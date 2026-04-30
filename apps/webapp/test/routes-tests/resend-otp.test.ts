// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";

vi.mock("~/modules/auth/service.server", () => ({
  OTP_REQUEST_MODES: ["login", "signup", "confirm_signup"],
  resendVerificationEmail: vi.fn(),
  sendOTP: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/resend-otp");
const { resendVerificationEmail, sendOTP } = await import(
  "~/modules/auth/service.server"
);

function buildRequest(body: URLSearchParams) {
  return new Request("https://example.com/resend-otp", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("resend-otp action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resends signup verification emails through the verification path", async () => {
    const result = await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            email: "user@example.com",
            mode: "confirm_signup",
          })
        ),
      })
    );

    expect(resendVerificationEmail).toHaveBeenCalledWith("user@example.com");
    expect(sendOTP).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, success: true });
  });

  it("uses login mode when resending login OTPs", async () => {
    const result = await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            email: "user@example.com",
            mode: "login",
          })
        ),
      })
    );

    expect(sendOTP).toHaveBeenCalledWith("user@example.com", "login");
    expect(resendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ error: null, success: true });
  });
});
