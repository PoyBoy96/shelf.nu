import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import {
  OTP_REQUEST_MODES,
  resendVerificationEmail,
  sendOTP,
} from "~/modules/auth/service.server";
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
        const { email, mode } = parseData(
          await request.formData(),
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

        if (mode === "confirm_signup") {
          await resendVerificationEmail(email);
        } else {
          await sendOTP(email, mode ?? "login");
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
