import { Currency, OrganizationRoles, OrganizationType } from "@prisma/client";
import {
  MaxFileSizeExceededError,
  parseFormData,
} from "@remix-run/form-data-parser";
import { useAtomValue } from "jotai";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import {
  Form,
  data,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { z } from "zod";
import { dynamicTitleAtom } from "~/atoms/dynamic-title-atom";

import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import TransferOwnershipCard from "~/components/settings/transfer-ownership-card";
import { Button } from "~/components/shared/button";

import {
  EditGeneralWorkspaceSettingsFormSchema,
  EditWorkspacePermissionsSettingsFormSchema,
  EditWorkspaceSSOSettingsFormSchema,
  WorkspaceEditForms,
} from "~/components/workspace/edit-form";
import { db } from "~/database/db.server";
import { setSelectedOrganizationIdCookie } from "~/modules/organization/context.server";
import {
  getOrganizationAdmins,
  requestWorkspaceDeletion,
  updateOrganization,
  updateOrganizationPermissions,
} from "~/modules/organization/service.server";
import { getOrganizationTierLimit } from "~/modules/tier/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { resolveShowShelfBranding } from "~/utils/branding";
import { DEFAULT_MAX_IMAGE_UPLOAD_SIZE } from "~/utils/constants";
import { setCookie } from "~/utils/cookies.server";
import { sendNotification } from "~/utils/emitter/send-notification.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import {
  assertIsPost,
  payload,
  error,
  getParams,
  parseData,
} from "~/utils/http.server";

import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import {
  getOwnerSubscriptionInfo,
  premiumIsEnabled,
} from "~/utils/stripe.server";
import { canHideShelfBranding } from "~/utils/subscription.server";

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { workspaceId: id } = getParams(
    params,
    z.object({ workspaceId: z.string() }),
    {
      additionalData: { userId },
    }
  );

  try {
    const { organizations } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.workspace,
      action: PermissionAction.update,
    });

    /** We get the organization and make sure the current user is the owner as only owner should be able to edit it */
    const organization = await db.organization
      .findUniqueOrThrow({
        where: {
          id,
          archivedAt: null,
          deletionScheduledFor: null,
          owner: {
            is: {
              id: authSession.userId,
            },
          },
        },
        include: {
          ssoDetails: true,
        },
      })
      .catch((cause) => {
        throw new ShelfError({
          cause,
          message: "Your are not the owner of this organization.",
          additionalData: {
            userId,
            id,
          },
          label: "Organization",
          status: 403,
        });
      });

    const [admins, tierLimit, user] = await Promise.all([
      getOrganizationAdmins({
        organizationId: organization.id,
      }),
      getOrganizationTierLimit({
        organizationId: organization.id,
        organizations,
      }),
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { tierId: true },
      }),
    ]);

    const canHideBranding = canHideShelfBranding(tierLimit);

    // Team tier users can only hide branding on team workspaces
    // Plus tier users can only hide branding on personal workspaces
    const canHideBrandingForThisWorkspace =
      canHideBranding &&
      (organization.type === OrganizationType.TEAM || user.tierId === "tier_1");

    // Get subscription info for the workspace owner (for transfer dialog)
    const ownerSubscriptionInfo = await getOwnerSubscriptionInfo(
      organization.userId,
      organization.id
    );

    // Count owner's other team workspaces (for warning about tier downgrade)
    const ownerOtherTeamWorkspacesCount = await db.organization.count({
      where: {
        userId: organization.userId,
        type: OrganizationType.TEAM,
        id: { not: organization.id },
      },
    });

    const header: HeaderData = {
      title: `Edit | ${organization.name}`,
    };

    return payload({
      organization,
      header,
      curriences: Object.keys(Currency),
      isPersonalWorkspace: organization.type === OrganizationType.PERSONAL,
      admins,
      canHideShelfBranding: canHideBrandingForThisWorkspace,
      ownerSubscriptionInfo,
      ownerOtherTeamWorkspacesCount,
      premiumIsEnabled,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, id });
    throw data(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const handle = {
  breadcrumb: () => <span>Edit</span>,
};

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  /** Get the id of the organization from the params */
  const { workspaceId: id } = getParams(
    params,
    z.object({ workspaceId: z.string() }),
    {
      additionalData: { userId },
    }
  );

  try {
    assertIsPost(request);

    const { role, organizations } = await requirePermission({
      userId,
      request,
      entity: PermissionEntity.workspace,
      action: PermissionAction.update,
    });

    /** Because you can access this view even when you have a different currentOrganization than the one you are editing
     * We need to query the org using the orgId from the params
     */
    const organization = await db.organization
      .findUniqueOrThrow({
        where: {
          id,
          archivedAt: null,
          deletionScheduledFor: null,
          owner: {
            is: {
              id: authSession.userId,
            },
          },
        },
        include: {
          ssoDetails: true,
        },
      })
      .catch((cause) => {
        throw new ShelfError({
          cause,
          message: "Your are not the owner of this organization.",
          additionalData: {
            userId,
            id,
          },
          label: "Organization",
          status: 403,
        });
      });

    const [tierLimit, user] = await Promise.all([
      getOrganizationTierLimit({
        organizationId: organization.id,
        organizations,
      }),
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { tierId: true },
      }),
    ]);

    const canHideBranding = canHideShelfBranding(tierLimit);

    // Team tier users can only hide branding on team workspaces
    // Plus tier users can only hide branding on personal workspaces
    const canHideBrandingForThisWorkspace =
      canHideBranding &&
      (organization.type === OrganizationType.TEAM || user.tierId === "tier_1");

    const clonedRequest = request.clone();
    const formData = await clonedRequest.formData();

    const { intent } = parseData(
      formData,
      z.object({
        intent: z.enum(["general", "permissions", "sso", "delete"]),
      }),
      {
        additionalData: {
          organizationId: organization.id,
        },
      }
    );

    switch (intent) {
      case "general": {
        const schema = EditGeneralWorkspaceSettingsFormSchema(
          organization.type === "PERSONAL"
        );

        const parsedData = parseData(formData, schema, {
          additionalData: { userId, organizationId: id },
        });

        const { name, currency, qrIdDisplayPreference, showShelfBranding } =
          parsedData;

        let nextShowShelfBranding = resolveShowShelfBranding(
          showShelfBranding,
          organization.showShelfBranding
        );

        if (!canHideBrandingForThisWorkspace) {
          nextShowShelfBranding = true;
        }

        let formDataFile: FormData;
        try {
          formDataFile = await parseFormData(request, {
            maxFileSize: DEFAULT_MAX_IMAGE_UPLOAD_SIZE,
          });
        } catch (parseError) {
          if (parseError instanceof MaxFileSizeExceededError) {
            const reason = new ShelfError({
              cause: parseError,
              message: `Image size exceeds maximum allowed size of ${
                DEFAULT_MAX_IMAGE_UPLOAD_SIZE / (1024 * 1024)
              }MB`,
              status: 400,
              label: "Organization",
              additionalData: { userId, id, field: "image" },
              shouldBeCaptured: false,
            });
            return data(error(reason), { status: reason.status });
          }

          const reason = makeShelfError(parseError, {
            userId,
            organizationId: id,
          });
          return data(error(reason), { status: reason.status });
        }

        const file = formDataFile.get("image") as File | null;

        await updateOrganization({
          id,
          name,
          image: file || null,
          userId: authSession.userId,
          currency,
          qrIdDisplayPreference,
          showShelfBranding: nextShowShelfBranding,
        });

        sendNotification({
          title: "Workspace updated",
          message: "Your workspace  has been updated successfully",
          icon: { name: "success", variant: "success" },
          senderId: authSession.userId,
        });

        return payload({ success: true });
      }
      case "permissions": {
        const schema = EditWorkspacePermissionsSettingsFormSchema();

        const parsedData = parseData(formData, schema, {
          additionalData: { userId, organization },
        });

        const {
          selfServiceCanSeeCustody,
          selfServiceCanSeeBookings,
          baseUserCanSeeCustody,
          baseUserCanSeeBookings,
        } = parsedData;

        await updateOrganizationPermissions({
          id,
          configuration: {
            selfServiceCanSeeCustody,
            selfServiceCanSeeBookings,
            baseUserCanSeeCustody,
            baseUserCanSeeBookings,
          },
        });

        sendNotification({
          title: "Workspace updated",
          message: "Your workspace  has been updated successfully",
          icon: { name: "success", variant: "success" },
          senderId: authSession.userId,
        });

        return payload({ success: true });
      }
      case "sso": {
        if (role !== OrganizationRoles.OWNER) {
          throw new ShelfError({
            cause: null,
            title: "Permission denied",
            message: "You are not allowed to edit SSO settings.",
            label: "Settings",
          });
        }

        const { enabledSso } = organization;
        if (!enabledSso) {
          throw new ShelfError({
            cause: null,
            message: "SSO is not enabled for this organization.",
            additionalData: { userId, id },
            label: "Organization",
          });
        }

        const schema = EditWorkspaceSSOSettingsFormSchema(enabledSso);

        const parsedData = parseData(formData, schema, {
          additionalData: { userId, organizationId: id },
        });

        const { selfServiceGroupId, adminGroupId, baseUserGroupId } =
          parsedData;

        await updateOrganization({
          id,
          userId: authSession.userId,
          ssoDetails: {
            selfServiceGroupId: selfServiceGroupId as string,
            adminGroupId: adminGroupId as string,
            baseUserGroupId: baseUserGroupId as string,
          },
        });

        sendNotification({
          title: "Workspace updated",
          message: "Your workspace has been updated successfully",
          icon: { name: "success", variant: "success" },
          senderId: authSession.userId,
        });

        return payload({ success: true });
      }
      case "delete": {
        const { confirmation } = parseData(
          formData,
          z.object({
            confirmation: z.string().refine((value) => value === "DELETE", {
              message: "Type DELETE to confirm workspace deletion.",
            }),
          }),
          {
            additionalData: { userId, organizationId: id },
          }
        );

        void confirmation;

        const deletionRequest = await requestWorkspaceDeletion({
          organizationId: id,
          actorUserId: userId,
        });

        sendNotification({
          title: "Workspace deletion scheduled",
          message: deletionRequest.billingCancellationError
            ? "Your workspace was archived and scheduled for deletion. Billing cancellation needs a support follow-up."
            : "Your workspace was archived and scheduled for deletion in 30 days.",
          icon: { name: "success", variant: "success" },
          senderId: authSession.userId,
        });

        return redirect("/", {
          headers: [
            setCookie(
              await setSelectedOrganizationIdCookie(
                deletionRequest.fallbackOrganizationId
              )
            ),
          ],
        });
      }
      default: {
        throw new ShelfError({
          cause: null,
          message: "Invalid action",
          additionalData: { intent },
          label: "Team",
        });
      }
    }
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    // File size errors are now handled in the validation above
    return data(error(reason), { status: reason.status });
  }
}

export default function WorkspaceEditPage() {
  const name = useAtomValue(dynamicTitleAtom);
  const actionData = useActionData<{ error?: { message?: string } }>();
  const hasName = name !== "Untitled workspace";
  const {
    organization,
    admins,
    ownerSubscriptionInfo,
    ownerOtherTeamWorkspacesCount,
    premiumIsEnabled: premiumEnabled,
  } = useLoaderData<typeof loader>();
  return (
    <>
      <Header
        title={hasName ? name : organization.name}
        hideBreadcrumbs
        classNames="-mt-5"
      />
      <div className="items-top flex justify-between">
        <WorkspaceEditForms
          name={organization.name || name}
          currency={organization.currency}
          qrIdDisplayPreference={organization.qrIdDisplayPreference}
          className="mt-4"
        />
      </div>

      <TransferOwnershipCard
        admins={admins}
        ownerSubscriptionInfo={ownerSubscriptionInfo}
        ownerOtherTeamWorkspacesCount={ownerOtherTeamWorkspacesCount}
        premiumIsEnabled={premiumEnabled}
      />
      <DeleteWorkspaceCard
        error={actionData?.error?.message}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </>
  );
}

function DeleteWorkspaceCard({
  error,
  organizationId,
  organizationName,
}: {
  error?: string;
  organizationId: string;
  organizationName: string;
}) {
  return (
    <div
      id="delete-workspace"
      className="mt-6 scroll-mt-6 rounded border border-error-200 bg-white p-6"
    >
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold text-error-700">
          Delete workspace
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Export your workspace assets before deleting. Deletion archives this
          workspace immediately, turns off workspace add-ons, and schedules
          permanent deletion 30 days later. You must already belong to another
          active workspace.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            to={`/account-details/workspace/${organizationId}/assets-export.csv`}
            role="link"
            variant="secondary"
          >
            Export assets CSV
          </Button>
        </div>
        <Form method="post" className="mt-5">
          <input type="hidden" name="intent" value="delete" />
          {error ? (
            <p className="mb-3 rounded border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-700">
              {error}
            </p>
          ) : null}
          <label
            htmlFor="delete-workspace-confirmation"
            className="block text-sm font-medium text-gray-700"
          >
            Type DELETE to confirm deletion of {organizationName}
          </label>
          <div className="mt-2 flex flex-wrap gap-3">
            <input
              id="delete-workspace-confirmation"
              name="confirmation"
              autoComplete="off"
              className="min-w-64 rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="DELETE"
            />
            <Button type="submit" variant="danger">
              Archive and schedule deletion
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
