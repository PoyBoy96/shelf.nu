import { OrganizationRoles } from "@prisma/client";
import { data, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "~/database/db.server";
import { exportAssetsBackupToCsv } from "~/utils/csv.server";
import { makeShelfError, ShelfError } from "~/utils/error";
import { error, getParams } from "~/utils/http.server";

export async function loader({ context, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { workspaceId } = getParams(
    params,
    z.object({ workspaceId: z.string() }),
    {
      additionalData: { userId },
    }
  );

  try {
    const membership = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: workspaceId,
        },
      },
      select: {
        roles: true,
        organization: {
          select: {
            id: true,
            name: true,
            archivedAt: true,
            deletionScheduledFor: true,
          },
        },
      },
    });

    if (
      !membership ||
      !membership.roles.includes(OrganizationRoles.OWNER) ||
      membership.organization.archivedAt ||
      membership.organization.deletionScheduledFor
    ) {
      throw new ShelfError({
        cause: null,
        message: "You are not allowed to export this workspace.",
        status: 403,
        label: "CSV",
        shouldBeCaptured: false,
      });
    }

    const csvString = await exportAssetsBackupToCsv({
      organizationId: workspaceId,
    });

    return new Response(csvString, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="${membership.organization.name}-assets.csv"`,
      },
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, workspaceId });
    return data(error(reason), { status: reason.status });
  }
}
