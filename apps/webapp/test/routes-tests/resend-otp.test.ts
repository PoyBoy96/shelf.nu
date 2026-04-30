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
  OTP_REQUEST_MODES: ["login", "signup", "confirm_signup"],
  resendVerificationEmail: vi.fn(),
  sendOTP: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/resend-otp");
const { action: sendOtpAction } = await import(
  "../../app/routes/_auth+/send-otp"
);
const { resendVerificationEmail, sendOTP } = await import(
  "~/modules/auth/service.server"
);

function buildRequest(body: URLSearchParams, ip = "203.0.113.10") {
  return new Request("https://example.com/resend-otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-forwarded-for": ip,
    },
    body,
  });
}

function buildSendOtpRequest(body: URLSearchParams, ip = "203.0.113.10") {
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

describe("resend-otp action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthBotProtectionState();
  });

  it("resends signup verification emails through the verification path", async () => {
    const result = await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({
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
          withBotProtection({
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

  it("blocks bot-protected resend attempts before auth email sends", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({
            email: "user@example.com",
            mode: "login",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "bot",
          })
        ),
      })
    )) as unknown as Response;

    expect(sendOTP).not.toHaveBeenCalled();
    expect(resendVerificationEmail).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("applies cooldown before a second resend can send another email", async () => {
    const request = buildRequest(
      withBotProtection({
        email: "user@example.com",
        mode: "login",
      })
    );

    const firstResult = await action(
      createActionArgs({
        request,
      })
    );

    const secondResponse = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({
            email: "user@example.com",
            mode: "login",
          })
        ),
      })
    )) as unknown as Response;

    expect(firstResult).toEqual({ error: null, success: true });
    expect(sendOTP).toHaveBeenCalledTimes(1);
    expect(secondResponse.status).toBe(400);
  });

  it("shares cooldown with send-otp for the same email and client", async () => {
    const firstResponse = (await sendOtpAction(
      createActionArgs({
        request: buildSendOtpRequest(
          withBotProtection({
            email: "user@example.com",
            mode: "login",
          })
        ),
      })
    )) as Response;

    const secondResponse = (await action(
      createActionArgs({
        request: buildRequest(
          withBotProtection({
            email: "user@example.com",
            mode: "login",
          })
        ),
      })
    )) as unknown as Response;

    expect(firstResponse.status).toBe(302);
    expect(sendOTP).toHaveBeenCalledTimes(1);
    expect(secondResponse.status).toBe(400);
  });
});
