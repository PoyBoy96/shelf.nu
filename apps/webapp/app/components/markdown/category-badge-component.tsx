import {
  CategoryBadge,
  UNCATEGORIZED_BADGE_COLOR,
} from "~/components/assets/category-badge";

type Props = {
  name?: string;
  color?: string;
};

export function CategoryBadgeComponent({ name, color }: Props) {
  return (
    <CategoryBadge
      category={{
        id: "__note-category__",
        name: name ?? "Uncategorized",
        color: color ?? UNCATEGORIZED_BADGE_COLOR,
      }}
      className="inline-flex"
    />
  );
}
