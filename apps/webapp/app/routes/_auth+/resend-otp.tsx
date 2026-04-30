import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import {
  OTP_REQUEST_MODES,
  resendVerificationEmail,
  sendOTP,
} from "~/modules/auth/service.server";
import {
  assertBotProtectedAuthForm,
  reserveEmailActionCooldown,
  rollbackEmailActionCooldown,
} from "~/utils/auth-bot-protection.server";
import { makeShelfError, notAllowedMethod } from "~/utils/error";

import {
  payload,
  error,
  getActionMethod,
  parseData,
} from "~/utils/http.server";
import { validEmail } from "~/utils/misc";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const method = getActionMethod(request);

    switch (method) {
      case "POST": {
        const formData = await request.formData();
        assertBotProtectedAuthForm(formData);

        const { email, mode } = parseData(
          formData,
          z.object({
            email: z
              .string()
              .transform((email) => email.toLowerCase())
              .refine(validEmail, () => ({
                message: "Please enter a valid email",
              })),
            mode: z.enum(OTP_REQUEST_MODES).optional(),
          }),
          { shouldBeCaptured: false }
        );

        const cooldownReservation = reserveEmailActionCooldown(
          request,
          email,
          "resend-otp"
        );

        try {
          if (mode === "confirm_signup") {
            await resendVerificationEmail(email);
          } else {
            await sendOTP(email, mode ?? "login");
          }
        } catch (error) {
          rollbackEmailActionCooldown(
            request,
            email,
            "resend-otp",
            cooldownReservation
          );
          throw error;
        }

        return payload({ success: true });
      }
    }

    throw notAllowedMethod(method);
  } catch (cause) {
    //@ts-expect-error
    const isRateLimitError = cause.code === "over_email_send_rate_limit";

    const reason = makeShelfError(cause, {}, !isRateLimitError);
    return data(error(reason), { status: reason.status });
  }
}
