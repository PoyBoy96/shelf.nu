import { useEffect } from "react";
import { useActionData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { useDisabled } from "~/hooks/use-disabled";
import type { getUserWithContact } from "~/modules/user/service.server";
import {
  applyUserTheme,
  getUserTheme,
  USER_THEME_DESCRIPTIONS,
  USER_THEME_LABELS,
  USER_THEMES,
} from "~/modules/user/theme";
import type { UserPageActionData } from "~/routes/_layout+/account-details.general";
import { Form } from "../custom-form";
import FormRow from "../forms/form-row";
import { Button } from "../shared/button";
import { Card } from "../shared/card";

export const ThemeFormSchema = z.object({
  theme: z.enum(USER_THEMES),
});

export function ThemeForm({
  user,
}: {
  user: ReturnType<typeof getUserWithContact>;
}) {
  const zo = useZorm("ThemeForm", ThemeFormSchema);
  const data = useActionData<UserPageActionData>();
  const disabled = useDisabled();

  useEffect(() => {
    if (data && "theme" in data && data.theme) {
      applyUserTheme(getUserTheme(data.theme));
    }
  }, [data]);

  return (
    <Card className="my-0">
      <div className="mb-6">
        <h3 className="text-text-lg font-semibold">Theme</h3>
        <p className="text-sm text-gray-600">
          Choose how Shelf looks for your account.
        </p>
      </div>
      <Form method="post" ref={zo.ref} replace>
        <FormRow
          rowLabel="Theme"
          subHeading="Applies across your signed-in sessions."
          className="border-t"
        >
          <label className="w-full" htmlFor={zo.fields.theme()}>
            <span className="sr-only">Theme</span>
            <select
              id={zo.fields.theme()}
              name={zo.fields.theme()}
              defaultValue={user.theme}
              disabled={disabled}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-[16px] text-gray-900 shadow outline-none focus:border-primary-300 focus:ring-0 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500"
            >
              {USER_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {USER_THEME_LABELS[theme]} - {USER_THEME_DESCRIPTIONS[theme]}
                </option>
              ))}
            </select>
          </label>
        </FormRow>
        <div className="text-right">
          <input type="hidden" name="type" value="updateTheme" />
          <Button
            disabled={disabled}
            type="submit"
            name="intent"
            value="updateTheme"
          >
            Save theme
          </Button>
        </div>
      </Form>
    </Card>
  );
}
