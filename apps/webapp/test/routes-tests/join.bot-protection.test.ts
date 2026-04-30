// @vitest-environment node

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createActionArgs } from "@mocks/remix";
import {
  AUTH_BOT_PROTECTION_HONEYPOT_FIELD,
  AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS,
  AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
} from "~/utils/auth-bot-protection";

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
  signUpWithEmailPass: vi.fn(),
}));

vi.mock("~/modules/user/service.server", () => ({
  findUserByEmail: vi.fn(),
}));

vi.mock("~/utils/sso.server", () => ({
  validateNonSSOSignup: vi.fn(),
}));

const { action } = await import("../../app/routes/_auth+/join");
const { signUpWithEmailPass } = await import("~/modules/auth/service.server");
const { findUserByEmail } = await import("~/modules/user/service.server");
const { validateNonSSOSignup } = await import("~/utils/sso.server");

function buildRequest(body: URLSearchParams) {
  return new Request("https://example.com/join", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("join action bot protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findUserByEmail).mockResolvedValue(null);
  });

  it("blocks bot-like submissions before sign up runs", async () => {
    const response = (await action(
      createActionArgs({
        request: buildRequest(
          new URLSearchParams({
            email: "user@example.com",
            password: "password123",
            confirmPassword: "password123",
            [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "filled",
            [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(
              Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
            ),
          })
        ),
      })
    )) as Response;

    expect(signUpWithEmailPass).not.toHaveBeenCalled();
    expect(validateNonSSOSignup).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
