// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";
import {
  AUTH_BOT_PROTECTION_HONEYPOT_FIELD,
  AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS,
  AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
} from "~/utils/auth-bot-protection";
import { clearAuthBotProtectionState } from "~/utils/auth-bot-protection.server";

const createDataMock = vi.hoisted(
  () => () =>
    vi.fn(
      (data: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(data), {
          status: init?.status || 200,
          headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
          },
        })
    )
);

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    data: createDataMock(),
  };
});

vi.mock("~/modules/auth/service.server", () => ({
  sendOTP: vi.fn(),
}));

vi.mock("~/utils/sso.server", () => ({
  validateNonSSOSignup: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/send-otp");
const { sendOTP } = await import("~/modules/auth/service.server");
const { validateNonSSOSignup } = await import("~/utils/sso.server");

function buildRequest(body: URLSearchParams, ip = "203.0.113.10") {
  return new Request("https://example.com/send-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
    },
    body,
  });
}

function withBotProtection(fields: Record<string, string>) {
  return new URLSearchParams({
    [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
    [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
      Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
    ),
    ...fields,
  });
}

describe("send-otp action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthBotProtectionState();
  });

  it("uses login mode by default when mode is missing", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(withBotProtection({ email: "user@example.com" })),
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
          withBotProtection({
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

  it("blocks submissions that trip bot protection before sending OTP", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({
            email: "user@example.com",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "bot",
          })
        ),
      })
    )) as Response;

    expect(sendOTP).not.toHaveBeenCalled();
    expect(validateNonSSOSignup).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("does not burn cooldown when OTP delivery fails", async () => {
    vi.mocked(sendOTP)
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(undefined as never);

    const firstResponse = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({ email: "user@example.com", mode: "login" })
        ),
      })
    )) as Response;

    const secondResponse = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({ email: "user@example.com", mode: "login" })
        ),
      })
    )) as Response;

    expect(firstResponse.status).toBe(500);
    expect(secondResponse.status).toBe(302);
    expect(sendOTP).toHaveBeenCalledTimes(2);
  });
});
