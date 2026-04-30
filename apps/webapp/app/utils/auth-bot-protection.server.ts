import { LRUCache } from "lru-cache";
import {
  AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS,
  AUTH_BOT_PROTECTION_HONEYPOT_FIELD,
  AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS,
  AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
} from "~/utils/auth-bot-protection";
import { badRequest } from "~/utils/error";

const BOT_PROTECTION_REJECTED_MESSAGE =
  "We couldn't process that request. Please try again.";
const BOT_PROTECTION_COOLDOWN_MESSAGE = "Please wait a moment and try again.";

const emailActionCooldownCache = new LRUCache<
  string,
  EmailActionCooldownReservation
>({
  max: 5_000,
  ttl: AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS,
});

export type EmailCooldownAction = "send-otp" | "resend-otp" | "forgot-password";

type EmailCooldownBucket = "otp-email" | "forgot-password";

export type EmailActionCooldownReservation = {
  owner: string;
  reservedAt: number;
};

export function assertBotProtectedAuthForm(formData: FormData) {
  const honeypotValue = formData.get(AUTH_BOT_PROTECTION_HONEYPOT_FIELD);
  if (typeof honeypotValue === "string" && honeypotValue.trim() !== "") {
    throw badRequest(BOT_PROTECTION_REJECTED_MESSAGE, {
      shouldBeCaptured: false,
    });
  }

  const renderedAtValue = formData.get(AUTH_BOT_PROTECTION_RENDERED_AT_FIELD);
  const renderedAt = Number(renderedAtValue);
  const formAgeMs = Date.now() - renderedAt;

  if (
    !Number.isFinite(renderedAt) ||
    formAgeMs < AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS
  ) {
    throw badRequest(BOT_PROTECTION_REJECTED_MESSAGE, {
      shouldBeCaptured: false,
    });
  }
}

export function reserveEmailActionCooldown(
  request: Request,
  email: string,
  action: EmailCooldownAction
): EmailActionCooldownReservation {
  const key = getEmailActionCooldownKey(request, email, action);

  const activeReservation = emailActionCooldownCache.get(key);

  if (
    activeReservation &&
    Date.now() - activeReservation.reservedAt <
      AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS
  ) {
    throw badRequest(BOT_PROTECTION_COOLDOWN_MESSAGE, {
      shouldBeCaptured: false,
    });
  }

  const reservation = {
    owner: crypto.randomUUID(),
    reservedAt: Date.now(),
  };
  emailActionCooldownCache.set(key, reservation);

  return reservation;
}

export function rollbackEmailActionCooldown(
  request: Request,
  email: string,
  action: EmailCooldownAction,
  reservation: EmailActionCooldownReservation
) {
  const key = getEmailActionCooldownKey(request, email, action);

  if (emailActionCooldownCache.get(key)?.owner === reservation.owner) {
    emailActionCooldownCache.delete(key);
  }
}

export function clearAuthBotProtectionState() {
  emailActionCooldownCache.clear();
}

function getEmailActionCooldownKey(
  request: Request,
  email: string,
  action: EmailCooldownAction
) {
  return `${getEmailActionCooldownBucket(action)}:${normalizeEmail(
    email
  )}:${getClientIpAddress(request)}`;
}

function getEmailActionCooldownBucket(
  action: EmailCooldownAction
): EmailCooldownBucket {
  switch (action) {
    case "send-otp":
    case "resend-otp":
      return "otp-email";
    case "forgot-password":
      return "forgot-password";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getClientIpAddress(request: Request) {
  const headerNames = [
    "cf-connecting-ip",
    "fly-client-ip",
    "x-real-ip",
    "x-forwarded-for",
    "x-client-ip",
    "true-client-ip",
  ];

  for (const headerName of headerNames) {
    const rawValue = request.headers.get(headerName);
    if (!rawValue) {
      continue;
    }

    const ip = rawValue
      .split(",")
      .map((value) => value.trim())
      .find(Boolean);

    if (ip) {
      return ip;
    }
  }

  return "unknown";
}
