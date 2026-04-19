import type { Organization } from "@prisma/client";
import { VerticalDotsIcon } from "~/components/icons/library";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/shared/dropdown";
import { Button } from "../shared/button";

export function WorkspaceActionsDropdown({
  workspaceId,
}: {
  workspaceId: Organization["id"];
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="outline-none focus-visible:border-0">
        <i className="inline-block px-3 py-0 text-gray-400 ">
          <VerticalDotsIcon />
        </i>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="order w-[180px] rounded-md bg-white p-0 text-right "
      >
        <DropdownMenuItem className="px-4 py-3">
          <Button
            to={`${workspaceId}/edit`}
            icon="pen"
            role="link"
            variant="link"
            className="justify-start text-gray-700 hover:text-gray-700"
            width="full"
          >
            Edit
          </Button>
        </DropdownMenuItem>
        <DropdownMenuItem className="px-4 py-3">
          <Button
            to={`${workspaceId}/edit#delete-workspace`}
            role="link"
            variant="link"
            className="justify-start text-error-600 hover:text-error-700"
            width="full"
          >
            Delete workspace
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
