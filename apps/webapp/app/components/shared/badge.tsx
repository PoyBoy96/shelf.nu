import type { ReactNode } from "react";
import { darkenColor, getThemeAwareBadgeColors } from "~/utils/color-contrast";
import { tw } from "~/utils/tw";

export const Badge = ({
  children,
  color,
  textColor,
  noBg = false,
  withDot = true,
  className = "",
}: {
  children: string | ReactNode;
  color: string;
  /**
   * Optional text color. If not provided, will automatically darken the background color.
   * Use this for predefined status badges where you want full control over the color combination.
   * When textColor is provided, the background color is used as-is without opacity.
   */
  textColor?: string;
  noBg?: boolean;
  withDot?: boolean;
  className?: string;
}) => {
  // Use predefined textColor if provided, otherwise darken the color for WCAG AA contrast
  // This allows user-generated colors (categories) to be automatically darkened,
  // while predefined status badges can use hand-picked accessible color combinations
  const finalTextColor = textColor || darkenColor(color, 0.5);

  // When textColor is provided, use the background color as-is (predefined colors)
  // Otherwise, compute theme-aware colors for user-generated colors.
  const themeAwareColors = textColor ? null : getThemeAwareBadgeColors(color);
  const finalBgColor = textColor ? color : themeAwareColors?.lightBg;

  return (
    <span
      style={{
        ...(textColor || noBg
          ? {
              backgroundColor: !noBg ? finalBgColor : undefined,
              color: finalTextColor,
            }
          : {}),
        ...(textColor
          ? {}
          : {
              ["--badge-bg-light" as string]: themeAwareColors?.lightBg,
              ["--badge-text-light" as string]: themeAwareColors?.lightText,
              ["--badge-bg-dark" as string]: themeAwareColors?.darkBg,
              ["--badge-text-dark" as string]: themeAwareColors?.darkText,
            }),
      }}
      className={tw(
        "inline-flex items-center rounded-2xl py-[2px] pl-[6px] text-[12px] font-medium",
        !textColor && !noBg && "theme-accent-badge",
        withDot ? " gap-1 pr-2" : "px-2",
        className
      )}
    >
      {withDot ? <div className="size-1.5 rounded-full bg-current" /> : null}

      <span>{children}</span>
    </span>
  );
};
