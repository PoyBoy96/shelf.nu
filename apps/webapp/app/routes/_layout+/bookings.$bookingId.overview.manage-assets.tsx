import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Asset,
  Booking,
  Category,
  Custody,
  Prisma,
  Tag,
} from "@prisma/client";
import { AssetStatus, BookingStatus } from "@prisma/client";
import { useAtomValue, useSetAtom } from "jotai";
import { Star } from "lucide-react";
import type {
  ActionFunctionArgs,
  LinksFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  redirect,
  useFetcher,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import { z } from "zod";
import {
  disabledBulkItemsAtom,
  selectedBulkItemsAtom,
  selectedBulkItemsCountAtom,
  setDisabledBulkItemsAtom,
  setSelectedBulkItemAtom,
  setSelectedBulkItemsAtom,
} from "~/atoms/list";
import { AssetImage } from "~/components/assets/asset-image/component";
import { AssetStatusBadge } from "~/components/assets/asset-status-badge";
import { ListItemTagsColumn } from "~/components/assets/assets-index/list-item-tags-column";
import { CategoryBadge } from "~/components/assets/category-badge";
import { AvailabilityLabel } from "~/components/booking/availability-label";
import { AvailabilitySelect } from "~/components/booking/availability-select";
import { StatusFilter } from "~/components/booking/status-filter";
import styles from "~/components/booking/styles.css?url";
import { Form } from "~/components/custom-form";
import DynamicDropdown from "~/components/dynamic-dropdown/dynamic-dropdown";
import Input from "~/components/forms/input";
import { ChevronRight } from "~/components/icons/library";
import ImageWithPreview from "~/components/image-with-preview/image-with-preview";
import { List } from "~/components/list";
import { Filters } from "~/components/list/filters";
import type { ListItemData } from "~/components/list/list-item";
import { LocationBadge } from "~/components/location/location-badge";
import { Button } from "~/components/shared/button";
import { GrayBadge } from "~/components/shared/gray-badge";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/shared/tabs";
import { Td, Th } from "~/components/table";
import UnsavedChangesAlert from "~/components/unsaved-changes-alert";

import When from "~/components/when/when";
import { db } from "~/database/db.server";
import { useSearchParams } from "~/hooks/search-params";
import { LOCATION_WITH_HIERARCHY } from "~/modules/asset/fields";
import { getPaginatedAndFilterableAssets } from "~/modules/asset/service.server";
import type { AssetsFromViewItem } from "~/modules/asset/types";
import { getAssetsWhereInput } from "~/modules/asset/utils.server";
import { sendBookingUpdatedEmail } from "~/modules/booking/email-helpers";
import {
  getBooking,
  getDetailedPartialCheckinData,
  getFullyIncludedKitIds,
  removeAssets,
  updateBookingAssets,
} from "~/modules/booking/service.server";
import {
  ApplyBookingTemplateFormSchema,
  CreateBookingTemplateFormSchema,
} from "~/modules/booking-template/schemas";
import {
  applyBookingTemplate,
  createBookingTemplate,
  listBookingTemplatesForUser,
} from "~/modules/booking-template/service.server";
import { createNotes } from "~/modules/note/service.server";
import { getUserByID } from "~/modules/user/service.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { isAssetPartiallyCheckedIn } from "~/utils/booking-assets";
import { isBookingOwnedByUser } from "~/utils/bookings";
import { getClientHint } from "~/utils/client-hints";
import { makeShelfError, ShelfError } from "~/utils/error";
import { isFormProcessing } from "~/utils/form";
import {
  payload,
  error,
  getCurrentSearchParams,
  getParams,
  parseData,
} from "~/utils/http.server";
import { ALL_SELECTED_KEY, isSelectingAllItems } from "~/utils/list";
import { wrapLinkForNote, wrapUserLinkForNote } from "~/utils/markdoc-wrappers";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.data";
import { requirePermission } from "~/utils/roles.server";
import { resolveUserDisplayName } from "~/utils/user";

export type AssetWithBooking = Asset & {
  bookings: Booking[];
  custody: Custody | null;
  category: Category;
  tags: Pick<Tag, "id" | "name" | "color">[];
  kitId?: string | null;
  qrScanned: string;
};

export type LastUserInfo = {
  bookingId: string;
  name: string;
};

export function mergeTemplateAssetsIntoSelection<
  TCurrentAsset extends { id: string },
  TTemplateAsset extends { id: string },
>(
  currentSelection: TCurrentAsset[],
  templateAvailableAssets: TTemplateAsset[]
) {
  const currentSelectionIds = new Set(
    currentSelection.map((asset) => asset.id)
  );

  return templateAvailableAssets.filter(
    (asset) => !currentSelectionIds.has(asset.id)
  );
}

export function applyTemplateAssetsToSelection<
  TCurrentAsset extends { id: string },
  TTemplateAsset extends { id: string },
  TTemplateApplication extends {
    availableAssets: TTemplateAsset[];
    unavailableAssets: unknown[];
    missingAssets: unknown[];
    templateId: string;
    templateName: string;
  },
>(
  currentSelection: TCurrentAsset[],
  templateApplication: TTemplateApplication
) {
  const newlyAddedAssets = mergeTemplateAssetsIntoSelection(
    currentSelection,
    templateApplication.availableAssets
  );

  return {
    nextSelectedBulkItems: [...currentSelection, ...newlyAddedAssets],
    templateApplySummary: {
      ...templateApplication,
      availableAssets: newlyAddedAssets,
    },
  };
}

export function buildLastUserMap(
  bookings: Array<{
    id: string;
    assets: Array<{ id: string }>;
    custodianUser: {
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
    custodianTeamMember: {
      name: string;
      user: {
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
      } | null;
    } | null;
  }>
): Record<string, LastUserInfo> {
  return bookings.reduce<Record<string, LastUserInfo>>((acc, booking) => {
    const lastUserName = booking.custodianUser
      ? resolveUserDisplayName(booking.custodianUser)
      : booking.custodianTeamMember?.user
      ? resolveUserDisplayName(booking.custodianTeamMember.user)
      : booking.custodianTeamMember?.name ?? "";

    if (!lastUserName) {
      return acc;
    }

    booking.assets.forEach((asset) => {
      if (!acc[asset.id]) {
        acc[asset.id] = {
          bookingId: booking.id,
          name: lastUserName,
        };
      }
    });

    return acc;
  }, {});
}

export const meta = () => [{ title: appendToMetaTitle("Manage assets") }];

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

function assertBookingAssetsManageable({
  bookingStatus,
  isSelfServiceOrBase,
  booking,
  userId,
}: {
  bookingStatus: BookingStatus;
  isSelfServiceOrBase: boolean;
  /** Creator/custodian info used for the booking-owner exception */
  booking?: { creatorId?: string | null; custodianUserId?: string | null };
  userId?: string;
}) {
  /**
   * Base/self-service users who own the booking (creator or custodian) are
   * allowed to keep managing assets while the booking is ONGOING/OVERDUE so
   * they can add forgotten gear after the start time.
   */
  const isOwnActiveBooking =
    !!booking &&
    isBookingOwnedByUser(booking, userId) &&
    (
      [BookingStatus.ONGOING, BookingStatus.OVERDUE] as BookingStatus[]
    ).includes(bookingStatus);

  const cantManageAssetsAsBaseOrSelfService =
    isSelfServiceOrBase &&
    bookingStatus !== BookingStatus.DRAFT &&
    !isOwnActiveBooking;

  const isNotAllowedStatus = (
    [
      BookingStatus.CANCELLED,
      BookingStatus.ARCHIVED,
      BookingStatus.COMPLETE,
    ] as BookingStatus[]
  ).includes(bookingStatus);

  if (cantManageAssetsAsBaseOrSelfService || isNotAllowedStatus) {
    throw new ShelfError({
      cause: null,
      label: "Booking",
      message: isNotAllowedStatus
        ? "Changing of assets is not allowed for current status of booking."
        : "You are unable to manage assets at this point because the booking is already reserved. Cancel this booking and create another one if you need to make changes.",
      shouldBeCaptured: false,
      additionalData: {
        bookingStatus,
        isSelfServiceOrBase,
      },
    });
  }
}

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { bookingId: id } = getParams(
    params,
    z.object({ bookingId: z.string() }),
    {
      additionalData: { userId },
    }
  );

  try {
    const { organizationId, userOrganizations, isSelfServiceOrBase } =
      await requirePermission({
        userId: authSession?.userId,
        request,
        entity: PermissionEntity.booking,
        action: PermissionAction.update,
      });

    const {
      search,
      totalAssets,
      perPage,
      page,
      categories,
      tags,
      assets,
      totalPages,
      totalCategories,
      totalTags,
      locations,
      totalLocations,
    } = await getPaginatedAndFilterableAssets({
      request,
      organizationId,
      userId,
      extraInclude: {
        location: LOCATION_WITH_HIERARCHY,
      },
    });

    const modelName = {
      singular: "asset",
      plural: "assets",
    };

    const booking = await getBooking({
      id,
      organizationId,
      userOrganizations,
      request,
    });
    const bookingTemplates = await listBookingTemplatesForUser({
      organizationId,
      ownerId: userId,
    });

    assertBookingAssetsManageable({
      bookingStatus: booking.status,
      isSelfServiceOrBase,
      booking,
      userId,
    });

    /**
     * Only kits that are FULLY included in the booking are managed via the
     * kits tab. Assets of partially pulled kits are managed individually.
     */
    const bookingKitIds = await getFullyIncludedKitIds({
      assets: booking.assets,
      organizationId,
    });
    const assetIds = assets.map((asset) => asset.id);
    const favoriteAssetIds = assetIds.length
      ? (
          await db.assetFavorite.findMany({
            where: {
              organizationId,
              ownerId: userId,
              assetId: { in: assetIds },
            },
            select: { assetId: true },
          })
        ).map((favorite) => favorite.assetId)
      : [];

    const lastUsersByAssetId = assetIds.length
      ? buildLastUserMap(
          await db.booking.findMany({
            where: {
              organizationId,
              status: {
                in: [
                  BookingStatus.RESERVED,
                  BookingStatus.ONGOING,
                  BookingStatus.OVERDUE,
                  BookingStatus.COMPLETE,
                ],
              },
              assets: {
                some: {
                  id: { in: assetIds },
                },
              },
              OR: [
                { custodianUserId: { not: null } },
                { custodianTeamMemberId: { not: null } },
              ],
            },
            orderBy: [{ to: "desc" }, { updatedAt: "desc" }],
            select: {
              id: true,
              assets: {
                where: {
                  id: { in: assetIds },
                },
                select: { id: true },
              },
              custodianUser: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                },
              },
              custodianTeamMember: {
                select: {
                  name: true,
                  user: {
                    select: {
                      displayName: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          })
        )
      : {};

    return payload({
      header: {
        title: `Add assets for '${booking?.name}'`,
        subHeading: "Fill up the booking with the assets of your choice",
      },
      searchFieldLabel: "Search assets",
      searchFieldTooltip: {
        title: "Search your asset database",
        text: "Search assets based on asset name or description, category, tag, location, custodian name. Simply separate your keywords by a space: 'Laptop lenovo 2020'.",
      },
      showSidebar: true,
      noScroll: true,
      booking,
      bookingTemplates,
      items: assets,
      categories,
      tags,
      search,
      page,
      totalItems: totalAssets,
      perPage,
      totalPages,
      modelName,
      totalCategories,
      totalTags,
      locations,
      totalLocations,
      bookingKitIds,
      favoriteAssetIds,
      lastUsersByAssetId,
    });
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, id });
    throw data(error(reason), { status: reason.status });
  }
}

export async function action({ context, request, params }: ActionFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;
  const { bookingId } = getParams(params, z.object({ bookingId: z.string() }), {
    additionalData: { userId },
  });

  try {
    const { organizationId, isSelfServiceOrBase } = await requirePermission({
      userId: authSession?.userId,
      request,
      entity: PermissionEntity.booking,
      action: PermissionAction.update,
    });

    const formData = await request.formData();
    const intent = formData.get("intent");

    const booking = await db.booking
      .findUniqueOrThrow({
        where: { id: bookingId, organizationId },
        select: {
          id: true,
          name: true,
          status: true,
          creatorId: true,
          custodianUserId: true,
          /** We need to get the original assets that were part of the booking before the update so we can compare */
          assets: {
            where: { kitId: null },
            select: {
              id: true,
              title: true,
              sequentialId: true,
            },
          },
        },
      })
      .catch((cause) => {
        throw new ShelfError({
          cause,
          label: "Booking",
          message:
            "Booking not found. Are you sure it exists in the current workspace.",
        });
      });

    assertBookingAssetsManageable({
      bookingStatus: booking.status,
      isSelfServiceOrBase,
      booking,
      userId,
    });

    if (intent === "toggle-favorite") {
      const assetId = z.string().parse(formData.get("assetId"));
      const isFavorite =
        z.enum(["true", "false"]).parse(formData.get("isFavorite")) === "true";

      const asset = await db.asset.findFirst({
        where: {
          id: assetId,
          organizationId,
        },
        select: { id: true },
      });

      if (!asset) {
        throw new ShelfError({
          cause: null,
          label: "Assets",
          message: "Asset not found in the current workspace.",
          shouldBeCaptured: false,
          additionalData: { assetId, organizationId, userId },
        });
      }

      if (isFavorite) {
        await db.assetFavorite.upsert({
          where: {
            organizationId_ownerId_assetId: {
              organizationId,
              ownerId: userId,
              assetId,
            },
          },
          update: {},
          create: {
            organizationId,
            ownerId: userId,
            assetId,
          },
        });
      } else {
        await db.assetFavorite.deleteMany({
          where: {
            organizationId,
            ownerId: userId,
            assetId,
          },
        });
      }

      return payload({
        intent: "toggle-favorite",
        assetId,
        isFavorite,
      });
    }

    if (intent === "apply-template") {
      const { templateId } = parseData(
        formData,
        ApplyBookingTemplateFormSchema,
        {
          additionalData: { userId, bookingId },
        }
      );

      const templateApplication = await applyBookingTemplate({
        templateId,
        organizationId,
        ownerId: userId,
        bookingId,
        bookingStatus: booking.status,
      });

      return payload({
        intent: "apply-template",
        templateApplication,
      });
    }

    if (intent === "create-template") {
      const { name } = parseData(formData, CreateBookingTemplateFormSchema, {
        additionalData: { userId, bookingId },
      });

      const template = await createBookingTemplate({
        organizationId,
        ownerId: userId,
        name,
        items: booking.assets.map((asset) => ({
          assetId: asset.id,
          title: asset.title,
          sequentialId: asset.sequentialId,
        })),
      });

      return payload({
        intent: "create-template",
        createdTemplate: {
          id: template.id,
          name: template.name,
          itemCount: template.items.length,
        },
      });
    }

    let { assetIds, removedAssetIds, redirectTo } = parseData(
      formData,
      z.object({
        assetIds: z.array(z.string()).optional().default([]),
        removedAssetIds: z.array(z.string()).optional().default([]),
        redirectTo: z.string().optional().nullable(),
      }),
      {
        additionalData: { userId, bookingId },
      }
    );

    /**
     * If user has selected all assets, then we have to get ids of all those assets
     * with respect to the filters applied.
     * */
    const hasSelectedAll = assetIds.includes(ALL_SELECTED_KEY);
    if (hasSelectedAll) {
      const searchParams = getCurrentSearchParams(request);
      const assetsWhere = getAssetsWhereInput({
        organizationId,
        currentSearchParams: searchParams.toString(),
        userId,
      });

      const allAssets = await db.asset.findMany({
        where: {
          AND: [assetsWhere, { id: { notIn: removedAssetIds } }],
        },
        select: { id: true },
      });
      const bookingAssets = await db.asset.findMany({
        where: {
          id: { notIn: removedAssetIds },
          bookings: { some: { id: bookingId } },
        },
        select: { id: true },
      });

      const removedAssetIdSet = new Set(removedAssetIds);

      /**
       * New assets that needs to be added are
       * - Previously added assets
       * - All assets with applied filters
       *
       * Keep removed IDs excluded even if a query returns them unexpectedly.
       */
      assetIds = [
        ...new Set([
          ...allAssets.map((asset) => asset.id),
          ...bookingAssets.map((asset) => asset.id),
        ]),
      ].filter((assetId) => !removedAssetIdSet.has(assetId));
    }

    const user = await getUserByID(authSession.userId, {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        displayName: true,
      } satisfies Prisma.UserSelect,
    });

    // Get existing asset IDs from the booking
    const existingAssetIds = booking.assets.map((asset) => asset.id);

    // Filter out existing assets to get only newly added ones
    const newAssetIds = assetIds.filter(
      (assetId) => !existingAssetIds.includes(assetId)
    );

    // Get partial check-in details to determine actual availability using context-aware status
    const { partialCheckinDetails } =
      await getDetailedPartialCheckinData(bookingId);

    // Query assets that might block adding to an active booking:
    // CHECKED_OUT (already out in another booking) or IN_CUSTODY (held by a team member)
    const potentiallyUnavailableAssets = await db.asset.findMany({
      where: {
        id: { in: newAssetIds },
        status: { in: [AssetStatus.CHECKED_OUT, AssetStatus.IN_CUSTODY] },
      },
      select: { id: true, title: true, status: true },
    });

    const potentiallyCheckedOutAssets = potentiallyUnavailableAssets.filter(
      (asset) => asset.status === AssetStatus.CHECKED_OUT
    );

    // Filter out assets that are partially checked in within this booking context using centralized helper
    // These are effectively available for other bookings
    const checkedOutAssets = potentiallyCheckedOutAssets.filter(
      (asset) =>
        !isAssetPartiallyCheckedIn(asset, partialCheckinDetails, booking.status)
    );

    if (
      checkedOutAssets.length > 0 &&
      ["ONGOING", "OVERDUE"].includes(booking.status)
    ) {
      throw new ShelfError({
        cause: null,
        label: "Booking",
        title: "Not allowed. Assets already checked out",
        message: `The following assets are already checked out and cannot be added to the booking: ${checkedOutAssets
          .map((asset) => asset.title)
          .join(", ")}`,
        additionalData: {
          checkedOutAssets,
          bookingId,
          newAssetIds,
        },
        shouldBeCaptured: false,
      });
    }

    /**
     * Assets that are in custody can never be added to an active booking:
     * adding them would immediately mark them as CHECKED_OUT while a team
     * member still holds custody, corrupting the asset state.
     */
    const assetsInCustody = potentiallyUnavailableAssets.filter(
      (asset) => asset.status === AssetStatus.IN_CUSTODY
    );

    if (
      assetsInCustody.length > 0 &&
      ["ONGOING", "OVERDUE"].includes(booking.status)
    ) {
      throw new ShelfError({
        cause: null,
        label: "Booking",
        title: "Not allowed. Assets in custody",
        message: `The following assets are in custody of a team member and cannot be added to an active booking: ${assetsInCustody
          .map((asset) => asset.title)
          .join(", ")}. Release custody first.`,
        additionalData: {
          assetsInCustody,
          bookingId,
          newAssetIds,
        },
        shouldBeCaptured: false,
      });
    }

    /** We only update the booking if there are NEW assets to add */
    if (newAssetIds.length > 0) {
      /** We update the booking with ONLY the new assets to avoid connecting already-connected assets */
      const b = await updateBookingAssets({
        id: bookingId,
        organizationId,
        assetIds: newAssetIds, // Only the newly added assets
        userId,
      });

      /** We create notes for the newly added assets */
      const bookingLink = wrapLinkForNote(`/bookings/${b.id}`, b.name);
      await createNotes({
        content: `${wrapUserLinkForNote(user!)} added asset to ${bookingLink}.`,
        type: "UPDATE",
        userId: authSession.userId,
        assetIds: newAssetIds,
      });
    }

    /** If some assets were removed, we also need to handle those */
    if (removedAssetIds.length > 0) {
      // Get the removed assets with their titles for proper note generation
      const removedAssets = await db.asset.findMany({
        where: {
          id: { in: removedAssetIds },
          organizationId,
        },
        select: { id: true, title: true },
      });

      await removeAssets({
        booking: { id: bookingId, assetIds: removedAssetIds },
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        userId: authSession.userId,
        organizationId,
        assets: removedAssets,
      });
    }

    // Send email to custodian about asset changes
    const assetChanges: string[] = [];
    if (newAssetIds.length > 0) {
      assetChanges.push("Assets were added to the booking");
    }
    if (removedAssetIds.length > 0) {
      assetChanges.push("Assets were removed from the booking");
    }
    if (assetChanges.length > 0) {
      assetChanges.push("View booking activity for full details");
      void sendBookingUpdatedEmail({
        bookingId,
        organizationId,
        userId: authSession.userId,
        changes: assetChanges,
        hints: getClientHint(request),
      });
    }

    /**
     * If redirectTo is in form that means user has submitted the form through alert,
     * so we have to redirect to manage-kits url
     */
    if (redirectTo) {
      return redirect(redirectTo);
    }

    return redirect(`/bookings/${bookingId}`);
  } catch (cause) {
    const reason = makeShelfError(cause, { userId, bookingId });
    return data(error(reason), { status: reason.status });
  }
}

export default function AddAssetsToNewBooking() {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateApplySummary, setTemplateApplySummary] = useState<null | {
    templateName: string;
    availableAssets: Array<{
      id: string;
      title: string;
      sequentialId: string | null;
      kitId: null;
    }>;
    unavailableAssets: Array<{
      assetId: string;
      title: string;
      sequentialId: string | null;
      reason: string;
    }>;
    missingAssets: Array<{
      assetId: string;
      title: string;
      sequentialId: string | null;
    }>;
  }>(null);
  const [bookingTemplates, setBookingTemplates] = useState(
    () =>
      [] as Array<{
        id: string;
        name: string;
        items: Array<{ assetId: string }>;
      }>
  );
  const formRef = useRef<HTMLFormElement>(null);

  const {
    booking,
    bookingKitIds,
    bookingTemplates: loaderBookingTemplates,
    items,
    totalItems,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSearching = isFormProcessing(navigation.state);
  const submit = useSubmit();
  const applyTemplateFetcher = useFetcher<typeof action>();
  const createTemplateFetcher = useFetcher<typeof action>();

  const selectedBulkItems = useAtomValue(selectedBulkItemsAtom);
  const updateItem = useSetAtom(setSelectedBulkItemAtom);
  const setSelectedBulkItems = useSetAtom(setSelectedBulkItemsAtom);
  const selectedBulkItemsCount = useAtomValue(selectedBulkItemsCountAtom);
  const hasSelectedAllItems = isSelectingAllItems(selectedBulkItems);
  const disabledBulkItems = useAtomValue(disabledBulkItemsAtom);
  const setDisabledBulkItems = useSetAtom(setDisabledBulkItemsAtom);

  useEffect(() => {
    setBookingTemplates(loaderBookingTemplates);
  }, [loaderBookingTemplates]);

  /**
   * Assets of FULLY included kits are handled from manage-kits.
   * Assets that belong to a kit but were pulled individually (partial kit
   * pulls) are managed right here, like any other individual asset.
   */
  const bookingAssets = useMemo(
    () =>
      booking.assets.filter(
        (asset) => !asset.kitId || !bookingKitIds.includes(asset.kitId)
      ),
    [booking.assets, bookingKitIds]
  );

  const removedAssets = useMemo(
    () =>
      bookingAssets.filter(
        (asset) =>
          !selectedBulkItems.some(
            (selectedItem) => selectedItem.id === asset.id
          )
      ),
    [bookingAssets, selectedBulkItems]
  );

  const hasUnsavedChanges = selectedBulkItemsCount !== bookingAssets.length;

  const manageKitsUrl = useMemo(
    () =>
      `/bookings/${booking.id}/overview/manage-kits?${new URLSearchParams({
        // This button wouldnt be available at all if there is no booking.from and booking.to
        bookingFrom: new Date(booking.from).toISOString(),
        bookingTo: new Date(booking.to).toISOString(),
        hideUnavailable: "true",
        unhideAssetsBookigIds: booking.id,
      })}`,
    [booking]
  );

  /**
   * Set selected items for kit based on the route data
   */
  useEffect(
    function updateDefaultSelectedItems() {
      /**
       * We are setting the default items here from the server data. This runs only once on mount
       */
      setSelectedBulkItems(bookingAssets);
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * Set disabled items for assets.
   *
   * An asset cannot be selected when:
   * - it is marked as not available to book, or
   * - it belongs to a kit that is fully added to this booking (those are
   *   managed via the kits tab), or
   * - it is in custody while the booking has already started (adding it
   *   would immediately check it out while a team member still holds it).
   *   In-custody assets remain selectable for future-dated bookings.
   */
  const bookingHasStarted =
    ["ONGOING", "OVERDUE"].includes(booking.status) ||
    new Date(booking.from) <= new Date();

  useEffect(() => {
    const _disabledBulkItems = items.reduce<ListItemData[]>((acc, asset) => {
      const isPartOfFullyAddedKit =
        !!asset.kitId && bookingKitIds.includes(asset.kitId);
      const isBlockedByCustody = !!asset.custody && bookingHasStarted;

      if (
        !asset.availableToBook ||
        isPartOfFullyAddedKit ||
        isBlockedByCustody
      ) {
        acc.push(asset);
      }

      return acc;
    }, []);

    setDisabledBulkItems(_disabledBulkItems);
  }, [items, setDisabledBulkItems, bookingKitIds, bookingHasStarted]);

  useEffect(() => {
    const response = applyTemplateFetcher.data;

    if (
      !response ||
      response.error ||
      response.intent !== "apply-template" ||
      !("templateApplication" in response)
    ) {
      return;
    }

    const { nextSelectedBulkItems, templateApplySummary } =
      applyTemplateAssetsToSelection(
        selectedBulkItems,
        response.templateApplication
      );

    setSelectedBulkItems(nextSelectedBulkItems);
    setTemplateApplySummary(templateApplySummary);
  }, [applyTemplateFetcher.data, selectedBulkItems, setSelectedBulkItems]);

  useEffect(() => {
    const response = createTemplateFetcher.data;

    if (
      !response ||
      response.error ||
      response.intent !== "create-template" ||
      !("createdTemplate" in response)
    ) {
      return;
    }

    const createdTemplate = response.createdTemplate;
    setTemplateName("");
    setBookingTemplates((current) => {
      const next = current.filter(
        (template) => template.id !== createdTemplate.id
      );
      next.unshift({
        id: createdTemplate.id,
        name: createdTemplate.name,
        items: Array.from(
          { length: createdTemplate.itemCount },
          (_, index) => ({
            assetId: `placeholder-${index}`,
          })
        ),
      });
      return next;
    });
    setSelectedTemplateId(createdTemplate.id);
  }, [createTemplateFetcher.data]);

  return (
    <Tabs
      className="flex h-full max-h-full flex-col"
      value="assets"
      activationMode="manual"
      onValueChange={() => {
        if (hasUnsavedChanges) {
          setIsAlertOpen(true);
          return;
        }

        void navigate(manageKitsUrl);
      }}
    >
      <div className="border-b px-6 py-2">
        <TabsList className="w-full">
          <TabsTrigger
            className="flex-1 gap-x-2"
            value="assets"
            aria-label={`Assets tab${
              selectedBulkItemsCount > 0
                ? ` (${
                    hasSelectedAllItems ? totalItems : selectedBulkItemsCount
                  } selected)`
                : ""
            }`}
          >
            Assets{" "}
            {selectedBulkItemsCount > 0 ? (
              <GrayBadge className="size-[20px] border border-primary-200 bg-primary-50 text-[10px] leading-[10px] text-primary-700">
                {hasSelectedAllItems ? totalItems : selectedBulkItemsCount}
              </GrayBadge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            className="flex-1 gap-x-2"
            value="kits"
            aria-label={`Kits tab${
              bookingKitIds.length > 0
                ? ` (${bookingKitIds.length} selected)`
                : ""
            }`}
          >
            Kits
            {bookingKitIds.length > 0 ? (
              <GrayBadge className="size-[20px] border border-primary-200 bg-primary-50 text-[10px] leading-[10px] text-primary-700">
                {bookingKitIds.length}
              </GrayBadge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="border-b px-6 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <applyTemplateFetcher.Form
            method="post"
            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                Apply template
              </p>
              <p className="text-xs text-gray-500">
                Add available assets from one of your saved checkout templates.
              </p>
            </div>
            <input type="hidden" name="intent" value="apply-template" />
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="h-10 flex-1 rounded-[4px] border border-gray-300 px-3 text-sm text-gray-900"
                name="templateId"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                <option value="">Select a template</option>
                {bookingTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.items.length})
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                disabled={
                  !selectedTemplateId || applyTemplateFetcher.state !== "idle"
                }
              >
                Apply
              </Button>
            </div>
            {applyTemplateFetcher.data?.error ? (
              <p className="text-sm text-error-500">
                {applyTemplateFetcher.data.error.message}
              </p>
            ) : null}
          </applyTemplateFetcher.Form>

          <createTemplateFetcher.Form
            method="post"
            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">
                Save current assets as template
              </p>
              <p className="text-xs text-gray-500">
                Uses the booking's currently saved non-kit assets. Unsaved
                changes are not included in v1.
              </p>
            </div>
            <input type="hidden" name="intent" value="create-template" />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Input
                label="Template name"
                name="name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Studio checkout"
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={
                  bookingAssets.length === 0 ||
                  !templateName.trim() ||
                  createTemplateFetcher.state !== "idle"
                }
                className="sm:mt-6"
              >
                Save template
              </Button>
            </div>
            {createTemplateFetcher.data?.error ? (
              <p className="text-sm text-error-500">
                {createTemplateFetcher.data.error.message}
              </p>
            ) : createTemplateFetcher.data?.intent === "create-template" ? (
              <p className="text-sm text-success-700">
                Saved to your templates.
              </p>
            ) : null}
          </createTemplateFetcher.Form>
        </div>

        {templateApplySummary ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm shadow-sm">
            <p className="font-medium text-gray-900">
              Applied {templateApplySummary.templateName}
            </p>
            <p className="mt-1 text-gray-600">
              Added {templateApplySummary.availableAssets.length} available
              asset
              {templateApplySummary.availableAssets.length === 1
                ? ""
                : "s"}.{" "}
              {templateApplySummary.unavailableAssets.length +
                templateApplySummary.missingAssets.length >
              0
                ? "Unavailable or deleted items are listed below so the user can swap manually."
                : "Everything in the template is ready to confirm."}
            </p>
            {templateApplySummary.unavailableAssets.length > 0 ? (
              <div className="mt-3">
                <p className="font-medium text-gray-900">Unavailable</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600">
                  {templateApplySummary.unavailableAssets.map((asset) => (
                    <li key={asset.assetId}>
                      {asset.title}
                      {asset.sequentialId
                        ? ` (${asset.sequentialId})`
                        : ""}, {asset.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {templateApplySummary.missingAssets.length > 0 ? (
              <div className="mt-3">
                <p className="font-medium text-gray-900">Missing or deleted</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600">
                  {templateApplySummary.missingAssets.map((asset) => (
                    <li key={asset.assetId}>
                      {asset.title}
                      {asset.sequentialId ? ` (${asset.sequentialId})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Filters
        slots={{
          "left-of-search": <StatusFilter statusItems={AssetStatus} />,
          "right-of-search": (
            <div className="flex flex-wrap items-center gap-2">
              <FavoritesOnlyFilter />
              <AvailabilitySelect />
            </div>
          ),
        }}
        className="justify-between !border-t-0 border-b px-6 md:flex"
      />

      <div className="flex justify-around gap-2 border-b p-3 lg:gap-4">
        <DynamicDropdown
          trigger={
            <div className="flex h-6 cursor-pointer items-center gap-2">
              Categories <ChevronRight className="hidden rotate-90 md:inline" />
            </div>
          }
          model={{ name: "category", queryKey: "name" }}
          label="Filter by category"
          placeholder="Search categories"
          initialDataKey="categories"
          countKey="totalCategories"
        />
        <DynamicDropdown
          trigger={
            <div className="flex h-6 cursor-pointer items-center gap-2">
              Tags <ChevronRight className="hidden rotate-90 md:inline" />
            </div>
          }
          model={{ name: "tag", queryKey: "name" }}
          label="Filter by tag"
          initialDataKey="tags"
          countKey="totalTags"
        />
        <DynamicDropdown
          trigger={
            <div className="flex h-6 cursor-pointer items-center gap-2">
              Locations <ChevronRight className="hidden rotate-90 md:inline" />
            </div>
          }
          model={{ name: "location", queryKey: "name" }}
          label="Filter by location"
          initialDataKey="locations"
          countKey="totalLocations"
          renderItem={({ metadata }) => (
            <div className="flex items-center gap-2">
              <ImageWithPreview
                thumbnailUrl={metadata.thumbnailUrl}
                alt={metadata.name}
                className="size-6 rounded-[2px]"
              />
              <div>{metadata.name}</div>
            </div>
          )}
        />
      </div>

      <TabsContent value="assets" asChild>
        <List
          className="mx-0 mt-0 h-full border-0 "
          ItemComponent={RowComponent}
          /** Clicking on the row will add the current asset to the atom of selected assets */
          navigate={(_assetId, asset) => {
            /** Only allow user to select if the asset is available */
            if (disabledBulkItems.some((item) => item.id === asset.id)) {
              return;
            }

            updateItem(asset);
          }}
          emptyStateClassName="py-10"
          customEmptyStateContent={{
            title: "You haven't added any assets yet.",
            text: "What are you waiting for? Create your first asset now!",
            newButtonRoute: "/assets/new",
            newButtonContent: "New asset",
          }}
          bulkActions={<> </>}
          disableSelectAllItems
          headerChildren={
            <>
              <Th>Id</Th>
              <Th>Category</Th>
              <Th>Tags</Th>
              <Th>Location</Th>
              <Th>Last user</Th>
            </>
          }
        />
      </TabsContent>

      {/* Footer of the modal */}
      <footer className="item-center mt-auto flex shrink-0 items-center justify-between border-t bg-white px-6 py-3 shadow-[0_-1px_3px_rgba(16,24,40,0.05)]">
        <p className="font-medium text-gray-700">
          {hasSelectedAllItems ? totalItems : selectedBulkItemsCount} assets
          selected
        </p>

        <div className="flex gap-3">
          <Button variant="secondary" to={".."}>
            Close
          </Button>
          <Form method="post" ref={formRef}>
            {/* We create inputs for both the removed and selected assets, so we can compare and easily add/remove */}
            {removedAssets.map((asset, i) => (
              <input
                key={asset.id}
                type="hidden"
                name={`removedAssetIds[${i}]`}
                value={asset.id}
              />
            ))}
            {/* These are the ids selected by the user and stored in the atom */}
            {selectedBulkItems.map((asset, i) => (
              <input
                key={asset.id}
                type="hidden"
                name={`assetIds[${i}]`}
                value={asset.id}
              />
            ))}
            {hasUnsavedChanges && isAlertOpen ? (
              <input name="redirectTo" value={manageKitsUrl} type="hidden" />
            ) : null}
            <Button
              type="submit"
              name="intent"
              value="addAssets"
              disabled={isSearching}
            >
              Confirm
            </Button>
          </Form>
        </div>
      </footer>

      <UnsavedChangesAlert
        open={isAlertOpen}
        onOpenChange={setIsAlertOpen}
        onCancel={() => {
          void navigate(manageKitsUrl);
        }}
        onYes={() => {
          void submit(formRef.current);
        }}
      >
        You have added some assets to the booking but haven't saved it yet. Do
        you want to confirm adding those assets?
      </UnsavedChangesAlert>
    </Tabs>
  );
}

function FavoritesOnlyFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const favoritesOnly = searchParams.get("favoritesOnly") === "true";

  return (
    <Button
      type="button"
      variant="secondary"
      className={
        favoritesOnly
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : undefined
      }
      onClick={() => {
        setSearchParams((prev) => {
          prev.set("favoritesOnly", favoritesOnly ? "false" : "true");
          return prev;
        });
      }}
    >
      Favorites only
    </Button>
  );
}

const RowComponent = ({
  item,
}: {
  item: AssetsFromViewItem & {
    location?: Prisma.LocationGetPayload<typeof LOCATION_WITH_HIERARCHY> | null;
  };
}) => {
  const { favoriteAssetIds, lastUsersByAssetId, bookingKitIds } =
    useLoaderData<typeof loader>();
  const toggleFavoriteFetcher = useFetcher<typeof action>();
  const lastUser = lastUsersByAssetId[item.id];
  const { category, tags, location } = item;
  /** Asset belongs to a kit that is fully added to this booking, so it is managed via the kits tab */
  const isAddedThroughKit = !!item.kitId && bookingKitIds.includes(item.kitId);
  const isFavorite = favoriteAssetIds.includes(item.id);
  const pendingFavorite =
    toggleFavoriteFetcher.formData?.get("assetId") === item.id
      ? toggleFavoriteFetcher.formData?.get("isFavorite") === "true"
      : undefined;
  const favoriteState = pendingFavorite ?? isFavorite;

  return (
    <>
      {/* Name */}
      <Td className="w-full min-w-[330px] p-0 md:p-0">
        <div className="flex justify-between gap-3 p-4 md:px-6">
          <div className="flex items-center gap-3">
            <toggleFavoriteFetcher.Form
              method="post"
              onClick={(event) => event.stopPropagation()}
            >
              <input type="hidden" name="intent" value="toggle-favorite" />
              <input type="hidden" name="assetId" value={item.id} />
              <input
                type="hidden"
                name="isFavorite"
                value={favoriteState ? "false" : "true"}
              />
              <button
                type="submit"
                className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={
                  favoriteState
                    ? `Remove ${item.title} from favorites`
                    : `Add ${item.title} to favorites`
                }
                disabled={toggleFavoriteFetcher.state !== "idle"}
              >
                <Star
                  className={
                    favoriteState
                      ? "size-4 fill-amber-400 text-amber-400"
                      : "size-4 text-gray-400"
                  }
                />
              </button>
            </toggleFavoriteFetcher.Form>
            <div className="flex size-14 shrink-0 items-center justify-center">
              <AssetImage
                asset={{
                  id: item.id,
                  mainImage: item.mainImage,
                  thumbnailImage: item.thumbnailImage,
                  mainImageExpiration: item.mainImageExpiration,
                }}
                alt={`Image of ${item.title}`}
                className="size-full rounded-[4px] border object-cover"
              />
            </div>
            <div className="flex flex-col gap-y-1">
              <p className="word-break whitespace-break-spaces font-medium">
                {item.title}{" "}
              </p>
              <div className="flex flex-row gap-x-2">
                <When truthy={item.status === AssetStatus.AVAILABLE}>
                  <AssetStatusBadge
                    id={item.id}
                    status={item.status}
                    availableToBook={item.availableToBook}
                  />
                </When>

                <AvailabilityLabel
                  isAddedThroughKit={isAddedThroughKit}
                  showKitStatus
                  asset={item as unknown as AssetWithBooking}
                  isCheckedOut={item.status === "CHECKED_OUT"}
                />
              </div>
            </div>
          </div>
        </div>
      </Td>

      {/* ID */}
      <Td>{item.id}</Td>

      {/* Category */}
      <Td>
        <CategoryBadge category={category} />
      </Td>

      {/* Tags */}
      <Td className="text-left">
        <ListItemTagsColumn tags={tags} />
      </Td>

      {/* Location */}
      <Td>
        {location ? (
          <LocationBadge
            location={{
              id: location.id,
              name: location.name,
              parentId: location.parentId ?? undefined,
              childCount: location._count?.children ?? 0,
            }}
          />
        ) : null}
      </Td>

      <Td>
        <span className="text-sm text-gray-600">{lastUser?.name ?? "—"}</span>
      </Td>
    </>
  );
};
