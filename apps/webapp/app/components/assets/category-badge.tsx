import type { Category } from "@prisma/client";
import { UNCATEGORIZED_BADGE_COLOR } from "~/utils/theme-colors";
import { Badge } from "../shared/badge";

export { UNCATEGORIZED_BADGE_COLOR };

export function CategoryBadge({
  category,
  className,
}: {
  category: Pick<Category, "id" | "name" | "color"> | null;
  className?: string;
}) {
  return category ? (
    <Badge color={category.color} withDot={false} className={className}>
      {category.name}
    </Badge>
  ) : (
    <Badge
      color={UNCATEGORIZED_BADGE_COLOR}
      withDot={false}
      className={className}
    >
      Uncategorized
    </Badge>
  );
}
