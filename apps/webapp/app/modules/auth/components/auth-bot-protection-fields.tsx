import { useRef } from "react";
import {
  AUTH_BOT_PROTECTION_HONEYPOT_FIELD,
  AUTH_BOT_PROTECTION_RENDERED_AT_FIELD,
} from "~/utils/auth-bot-protection";

export function AuthBotProtectionFields({
  renderedAt = Date.now(),
}: {
  renderedAt?: number;
}) {
  const renderedAtRef = useRef(renderedAt);
  return (
    <>
      <div className="hidden" aria-hidden="true">
        <label htmlFor={AUTH_BOT_PROTECTION_HONEYPOT_FIELD}>Website</label>
        <input
          id={AUTH_BOT_PROTECTION_HONEYPOT_FIELD}
          type="text"
          name={AUTH_BOT_PROTECTION_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input
        type="hidden"
        name={AUTH_BOT_PROTECTION_RENDERED_AT_FIELD}
        value={String(renderedAtRef.current)}
      />
    </>
  );
}
