// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS,
  AUTH_BOT_PROTECTION_HONEYPOT_FIELD,
  AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS,
  AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
} from "~/utils/auth-bot-protection";
import {
  assertBotProtectedAuthForm,
  clearAuthBotProtectionState,
  reserveEmailActionCooldown,
  rollbackEmailActionCooldown,
} from "~/utils/auth-bot-protection.server";

describe("auth bot protection", () => {
  beforeEach(() => {
    clearAuthBotProtectionState();
    vi.useRealTimers();
  });

  it("rejects filled honeypot submissions", () => {
    const formData = new FormData();
    formData.set(AUTH_BOT_PROTECTION_HONEYPOT_FIELD, "https://spam.test");
    formData.set(
      AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
      String(Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS)
    );

    expect(() => assertBotProtectedAuthForm(formData)).toThrow(
      "We couldn't process that request. Please try again."
    );
  });

  it("rejects unrealistically fast submissions", () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(new Date("2026-04-30T18:00:00.000Z"));

    const formData = new FormData();
    formData.set(AUTH_BOT_PROTECTION_HONEYPOT_FIELD, "");
    formData.set(
      AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
      String(Date.now() - AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS + 1)
    );

    expect(() => assertBotProtectedAuthForm(formData)).toThrow(
      "We couldn't process that request. Please try again."
    );
  });

  it("reserves cooldown per normalized email and client ip", () => {
    const firstRequest = new Request("https://example.com/send-otp", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    const secondRequest = new Request("https://example.com/send-otp", {
      headers: { "x-real-ip": "203.0.113.7" },
    });

    expect(() =>
      reserveEmailActionCooldown(firstRequest, "User@Example.com ", "send-otp")
    ).not.toThrow();

    expect(() =>
      reserveEmailActionCooldown(secondRequest, "user@example.com", "send-otp")
    ).toThrow("Please wait a moment and try again.");
  });

  it("rolls back a reservation so a retry can proceed after failure", () => {
    const request = new Request("https://example.com/send-otp", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });

    const reservation = reserveEmailActionCooldown(
      request,
      "user@example.com",
      "send-otp"
    );
    rollbackEmailActionCooldown(
      request,
      "user@example.com",
      "send-otp",
      reservation
    );

    expect(() =>
      reserveEmailActionCooldown(request, "user@example.com", "send-otp")
    ).not.toThrow();
  });

  it("does not roll back a newer reservation after the original TTL expires", async () => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(new Date("2026-04-30T18:00:00.000Z"));
    vi.resetModules();

    const {
      clearAuthBotProtectionState: clearState,
      reserveEmailActionCooldown: reserveCooldown,
      rollbackEmailActionCooldown: rollbackCooldown,
    } = await import("~/utils/auth-bot-protection.server");

    clearState();

    const firstRequest = new Request("https://example.com/send-otp", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    const secondRequest = new Request("https://example.com/resend-otp", {
      headers: { "x-real-ip": "203.0.113.10" },
    });

    const firstReservation = reserveCooldown(
      firstRequest,
      "user@example.com",
      "send-otp"
    );

    vi.advanceTimersByTime(AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS + 1);

    reserveCooldown(secondRequest, "user@example.com", "resend-otp");
    rollbackCooldown(
      firstRequest,
      "user@example.com",
      "send-otp",
      firstReservation
    );

    expect(() =>
      reserveCooldown(secondRequest, "user@example.com", "resend-otp")
    ).toThrow("Please wait a moment and try again.");
  });

  it("shares one cooldown bucket across send-otp and resend-otp", () => {
    const sendRequest = new Request("https://example.com/send-otp", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    const resendRequest = new Request("https://example.com/resend-otp", {
      headers: { "x-real-ip": "203.0.113.9" },
    });

    reserveEmailActionCooldown(sendRequest, "user@example.com", "send-otp");

    expect(() =>
      reserveEmailActionCooldown(
        resendRequest,
        "user@example.com",
        "resend-otp"
      )
    ).toThrow("Please wait a moment and try again.");
  });
});
