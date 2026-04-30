import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthBotProtectionFields } from "~/modules/auth/components/auth-bot-protection-fields";
import { AUTH_BOT_PROTECTION_RENDERED_AT_FIELD } from "~/utils/auth-bot-protection";

describe("AuthBotProtectionFields", () => {
  it("keeps the initial renderedAt value across rerenders", () => {
    const { rerender } = render(<AuthBotProtectionFields renderedAt={111} />);

    const field = screen.getByDisplayValue("111") as HTMLInputElement;
    expect(field.name).toBe(AUTH_BOT_PROTECTION_RENDERED_AT_FIELD);

    rerender(<AuthBotProtectionFields renderedAt={222} />);

    expect(screen.getByDisplayValue("111")).toBe(field);
    expect(screen.queryByDisplayValue("222")).not.toBeInTheDocument();
  });
});
