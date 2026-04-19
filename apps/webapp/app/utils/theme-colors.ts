export const UNCATEGORIZED_BADGE_COLOR = "#667085";
export const PRINT_TABLE_BORDER_COLOR = "#d1d5db";

export const CANVAS_THEME_COLOR_FALLBACKS = {
  success600: "#039855",
  error600: "#d92d20",
} as const;

export const resolveThemeCanvasColor = (
  variableName: string,
  fallback: string
) => {
  if (typeof document === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  return value ? `rgb(${value.replace(/\s+/g, ", ")})` : fallback;
};
