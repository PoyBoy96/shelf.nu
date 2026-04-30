import type { ActionFunctionArgs } from "react-router";
import { data, redirect } from "react-router";

import { SendOtpSchema } from "~/modules/auth/components/continue-with-email-form";
import { sendOTP } from "~/modules/auth/service.server";
import {
  assertBotProtectedAuthForm,
  reserveEmailActionCooldown,
  rollbackEmailActionCooldown,
} from "~/utils/auth-bot-protection.server";
import { makeShelfError, notAllowedMethod } from "~/utils/error";
import { error, getActionMethod, parseData } from "~/utils/http.server";
import { validateNonSSOSignup } from "~/utils/sso.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const method = getActionMethod(request);

    switch (method) {
      case "POST": {
        const formData = await request.formData();
        assertBotProtectedAuthForm(formData);

        const { email, mode } = parseData(formData, SendOtpSchema, {
          shouldBeCaptured: false,
        });

        // Only validate SSO for signup attempts
        if (mode === "signup" || mode === "confirm_signup") {
          await validateNonSSOSignup(email);
        }

        const normalizedMode = mode ?? "login";

        const cooldownReservation = reserveEmailActionCooldown(
          request,
          email,
          "send-otp"
        );

        try {
          await sendOTP(email, normalizedMode);
        } catch (error) {
          rollbackEmailActionCooldown(
            request,
            email,
            "send-otp",
            cooldownReservation
          );
          throw error;
        }

        return redirect(
          `/otp?email=${encodeURIComponent(email)}&mode=${normalizedMode}`
        );
      }
    }

    throw notAllowedMethod(method);
  } catch (cause) {
    const reason = makeShelfError(cause);
    return data(error(reason), { status: reason.status });
  }
}
