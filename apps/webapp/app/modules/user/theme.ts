export const USER_THEMES = ["original", "dark", "light"] as const;

export type UserTheme = (typeof USER_THEMES)[number];

export const DEFAULT_USER_THEME: UserTheme = "original";

export const USER_THEME_LABELS: Record<UserTheme, string> = {
  original: "Original",
  dark: "Dark",
  light: "Light",
};

export const USER_THEME_DESCRIPTIONS: Record<UserTheme, string> = {
  original: "The classic Shelf orange theme.",
  dark: "Navy surfaces with a light blue accent.",
  light: "Light surfaces with a blue accent and dark blue text.",
};

export function isUserTheme(value: unknown): value is UserTheme {
  return typeof value === "string" && USER_THEMES.includes(value as UserTheme);
}

export function getUserTheme(value: unknown): UserTheme {
  return isUserTheme(value) ? value : DEFAULT_USER_THEME;
}

export function applyUserTheme(theme: UserTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
