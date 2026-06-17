import { useAtomValue } from "jotai";
import { useLoaderData } from "react-router";
import { useZorm } from "react-zorm";
import { z } from "zod";
import { selectedBulkItemsAtom } from "~/atoms/list";
import type { AssetIndexLoaderData } from "~/routes/_layout+/assets._index";
import { isSelectingAllItems } from "~/utils/list";
import { BulkUpdateDialogContent } from "../bulk-update-dialog/bulk-update-dialog";
import { Button } from "../shared/button";

export const BulkDeleteAssetsSchema = z.object({
  assetIds: z.array(z.string()).min(1),
  /** Why the assets are deleted — recorded in the deletion history */
  deletionReason: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.enum(["BROKEN", "MISSING", "REPLACED", "OTHER"]).optional()
  ),
});

export default function BulkDeleteDialog() {
  const { totalItems } = useLoaderData<AssetIndexLoaderData>();
  const zo = useZorm("BulkDeleteAssets", BulkDeleteAssetsSchema);

  const selectedAssets = useAtomValue(selectedBulkItemsAtom);

  const totalSelected = isSelectingAllItems(selectedAssets)
    ? totalItems
    : selectedAssets.length;

  return (
    <BulkUpdateDialogContent
      ref={zo.ref}
      type="trash"
      title={`Delete (${totalSelected}) assets`}
      description={`Are you sure you want to delete all (${totalSelected}) assets? This action cannot be undone.`}
      actionUrl="."
      arrayFieldId="assetIds"
    >
      {({ fetcherError, disabled, handleCloseDialog }) => (
        <>
          <input type="hidden" value="bulk-delete" name="intent" />

          {/* Reason for deletion — recorded in the deletion history */}
          <label
            className="mb-1 block text-sm font-medium text-gray-700"
            htmlFor="bulk-deletion-reason"
          >
            Reason for deletion
          </label>
          <select
            id="bulk-deletion-reason"
            name={zo.fields.deletionReason()}
            className="mb-4 h-10 w-full rounded border border-gray-300 px-3 text-sm text-gray-900"
            defaultValue=""
          >
            <option value="">Select a reason (optional)</option>
            <option value="BROKEN">Broken</option>
            <option value="MISSING">Missing</option>
            <option value="REPLACED">Replaced</option>
            <option value="OTHER">Other</option>
          </select>

          {fetcherError ? (
            <p className="text-sm text-error-500">{fetcherError}</p>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              width="full"
              disabled={disabled}
              onClick={handleCloseDialog}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              width="full"
              disabled={disabled}
              className="border-error-600 bg-error-600 hover:border-error-800 hover:bg-error-800"
            >
              Confirm
            </Button>
          </div>
        </>
      )}
    </BulkUpdateDialogContent>
  );
}
