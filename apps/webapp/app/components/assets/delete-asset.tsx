import type { ReactElement } from "react";
import { cloneElement, forwardRef, useState } from "react";
import type { Asset } from "@prisma/client";
import { useNavigation } from "react-router";
import { Button } from "~/components/shared/button";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/shared/modal";
import { isFormProcessing } from "~/utils/form";
import { Form } from "../custom-form";
import { TrashIcon } from "../icons/library";

type DeleteAssetProps = {
  asset: {
    id: Asset["id"];
    title: Asset["title"];
    mainImage: Asset["mainImage"];
  };
  trigger: ReactElement;
};

/**
 * Deletion reasons recorded in the workspace deletion history.
 * Keep in sync with the `DeletionReason` enum in the Prisma schema.
 */
const DELETION_REASONS = [
  { value: "BROKEN", label: "Broken" },
  { value: "MISSING", label: "Missing" },
  { value: "REPLACED", label: "Replaced" },
  { value: "OTHER", label: "Other" },
] as const;

export const DeleteAsset = forwardRef<HTMLButtonElement, DeleteAssetProps>(
  function ({ asset, trigger }, ref) {
    const navigation = useNavigation();
    const disabled = isFormProcessing(navigation.state);
    const [reason, setReason] = useState("");
    const [reasonNote, setReasonNote] = useState("");

    return (
      <AlertDialog>
        <AlertDialogTrigger ref={ref} asChild>
          {cloneElement(trigger)}
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto md:m-0">
              <span className="flex size-12 items-center justify-center rounded-full bg-error-50 p-2 text-error-600">
                <TrashIcon />
              </span>
            </div>
            <AlertDialogTitle>Delete {asset.title}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this asset? This action cannot be
              undone. The deletion is recorded in your workspace history.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Reason for deletion — recorded in the deletion history */}
          <div className="flex flex-col gap-2 py-2">
            <label
              htmlFor="asset-deletion-reason"
              className="text-sm font-medium text-gray-700"
            >
              Reason for deletion
            </label>
            <select
              id="asset-deletion-reason"
              className="h-10 w-full rounded border border-gray-300 px-3 text-sm text-gray-900"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            >
              <option value="">Select a reason...</option>
              {DELETION_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {reason === "OTHER" ? (
              <textarea
                aria-label="Deletion note"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
                placeholder="Add a short note about why this asset is being deleted"
                rows={2}
                maxLength={500}
                value={reasonNote}
                onChange={(event) => setReasonNote(event.target.value)}
              />
            ) : null}
          </div>

          <AlertDialogFooter>
            <div className="flex justify-center gap-2">
              <AlertDialogCancel asChild>
                <Button type="button" variant="secondary" disabled={disabled}>
                  Cancel
                </Button>
              </AlertDialogCancel>

              <Form method="delete" action={`/assets/${asset.id}`}>
                {asset.mainImage && (
                  <input
                    type="hidden"
                    value={asset.mainImage}
                    name="mainImageUrl"
                  />
                )}
                <input type="hidden" value="delete" name="intent" />
                <Button
                  className="border-error-600 bg-error-600 hover:border-error-800 hover:!bg-error-800"
                  type="submit"
                  data-test-id="confirmdeleteAssetButton"
                  disabled={disabled || !reason}
                >
                  Delete
                </Button>

                {/* Reason inputs live inside the form so they are submitted with it */}
                <input type="hidden" name="deletionReason" value={reason} />
                {reasonNote ? (
                  <input
                    type="hidden"
                    name="deletionReasonNote"
                    value={reasonNote}
                  />
                ) : null}
              </Form>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
);

DeleteAsset.displayName = "DeleteAsset";
