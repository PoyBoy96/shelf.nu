import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";
import { FakeCheckbox } from "../forms/fake-checkbox";

export const AddAssetForm = ({
  assetId,
  isChecked,
}: {
  assetId: Asset["id"];
  isChecked: boolean;
}) => {
  const fetcher = useFetcher();
  let optimisticIsChecked = isChecked;
  if (fetcher.formData) {
    optimisticIsChecked = fetcher.formData.get("isChecked") === "yes";
  }

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="assetId" value={assetId} />
      <input
        type="hidden"
        name="isChecked"
        value={optimisticIsChecked ? "no" : "yes"}
      />
      <button
        type="submit"
        className={optimisticIsChecked ? "text-primary" : "text-white"}
      >
        <FakeCheckbox checked={optimisticIsChecked} />
      </button>
    </fetcher.Form>
  );
};
