export const AUTH_BOT_PROTECTION_HONEYPOT_FIELD = "website";
export const AUTH_BOT_PROTECTION_RENDERED_AT_FIELD = "formRenderedAt";

export const AUTH_BOT_PROTECTION_MIN_FORM_AGE_MS = 1_500;
export const AUTH_BOT_PROTECTION_EMAIL_COOLDOWN_MS = 30_000;

export function createAuthBotProtectionValues(renderedAt = Date.now()) {
  return {
    [AUTH_BOT_PROTECTION_HONEYPOT_FIELD]: "",
    [AUTH_BOT_PROTECTION_RENDERED_AT_FIELD]: String(renderedAt),
  };
}
