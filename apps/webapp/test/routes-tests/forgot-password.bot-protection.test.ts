// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("~/database/db.server", () => ({
  db: {
    user: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("~/integrations/supabase/client", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("~/modules/auth/service.server", () => ({
  sendResetPasswordLink: vi.fn(),
  updateAccountPassword: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/forgot-password");
const { db } = await import("~/database/db.server");
const { sendResetPasswordLink } = await import("~/modules/auth/service.server");

function buildRequest(body: URLSearchParams) {
  return new Request("https://example.com/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("forgot-password action bot protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthBotProtectionState();
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "user-1",
      sso: false,
    } as any);
  });

  it("blocks fast reset requests before reset email is sent", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            intent: "request-otp",
            email: "user@example.com",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
            [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(Date.now()),
          })
        ),
      })
    )) as Response;

    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(sendResetPasswordLink).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });

  it("applies cooldown before sending another reset email", async () => {
    const body = new URLSearchParams({
      intent: "request-otp",
      email: "user@example.com",
      [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
      [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
        Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
      ),
    });

    const firstResponse = (await action(
      createActionArgs({
        request: buildRequest(body),
      })
    )) as Response;

    const secondResponse = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            intent: "request-otp",
            email: "user@example.com",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
            [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
              Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
            ),
          })
        ),
      })
    )) as Response;

    expect(firstResponse.status).toBe(302);
    expect(sendResetPasswordLink).toHaveBeenCalledTimes(1);
    expect(secondResponse.status).toBe(400);
  });

  it("does not burn cooldown when reset email delivery fails", async () => {
    vi.mocked(sendResetPasswordLink)
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce(undefined as never);

    const firstResponse = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            intent: "request-otp",
            email: "user@example.com",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
            [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
              Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
            ),
          })
        ),
      })
    )) as Response;

    const secondResponse = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            intent: "request-otp",
            email: "user@example.com",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
            [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
              Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
            ),
          })
        ),
      })
    )) as Response;

    expect(firstResponse.status).toBe(500);
    expect(secondResponse.status).toBe(302);
    expect(sendResetPasswordLink).toHaveBeenCalledTimes(2);
  });
});
