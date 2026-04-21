import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { getThemeAwareBadgeColors } from "~/utils/color-contrast";
import { tw } from "~/utils/tw";

type TagProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  color?: string;
  withDot?: boolean;
};

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { children, className, color, withDot = false, ...props },
  ref
) {
  const hasColor = Boolean(color);
  const themeAwareColors =
    hasColor && color ? getThemeAwareBadgeColors(color) : null;

  return (
    <span
      ref={ref}
      className={tw(
        "inline-flex items-center rounded-2xl bg-gray-100 py-0.5 pl-1.5 text-[12px] font-medium text-gray-700",
        hasColor && "theme-accent-badge",
        withDot ? " gap-1 pr-2" : "px-2",
        className
      )}
      style={
        hasColor
          ? {
              ["--badge-bg-light" as string]: themeAwareColors?.lightBg,
              ["--badge-text-light" as string]: themeAwareColors?.lightText,
              ["--badge-bg-dark" as string]: themeAwareColors?.darkBg,
              ["--badge-text-dark" as string]: themeAwareColors?.darkText,
            }
          : undefined
      }
      {...props}
    >
      {withDot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
});
