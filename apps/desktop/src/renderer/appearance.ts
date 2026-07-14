export const themeModes = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const accentColors = ["blue", "violet", "green", "amber"] as const;
export type AccentColor = (typeof accentColors)[number];

export type ResolvedTheme = Exclude<ThemeMode, "system">;

export interface AppearancePreferences {
  readonly accent: AccentColor;
  readonly mode: ThemeMode;
}

export const defaultAppearance: AppearancePreferences = {
  accent: "blue",
  mode: "system",
};

export const appearanceStorageKeys = {
  accent: "donecheck.appearance.accent",
  mode: "donecheck.appearance.mode",
} as const;

export function parseThemeMode(value: string | null): ThemeMode {
  return themeModes.find((mode) => mode === value) ?? defaultAppearance.mode;
}

export function parseAccentColor(value: string | null): AccentColor {
  return accentColors.find((accent) => accent === value) ?? defaultAppearance.accent;
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

export function readAppearancePreferences(storage: Storage): AppearancePreferences {
  return {
    accent: parseAccentColor(storage.getItem(appearanceStorageKeys.accent)),
    mode: parseThemeMode(storage.getItem(appearanceStorageKeys.mode)),
  };
}

export function persistAppearancePreferences(
  storage: Storage,
  preferences: AppearancePreferences,
): void {
  storage.setItem(appearanceStorageKeys.accent, preferences.accent);
  storage.setItem(appearanceStorageKeys.mode, preferences.mode);
}
