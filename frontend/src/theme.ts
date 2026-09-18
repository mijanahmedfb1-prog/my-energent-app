import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  // Surfaces
  surface: "#0A0A0A",
  onSurface: "#F5F5F5",
  surfaceSecondary: "#171717",
  onSurfaceSecondary: "#E5E5E0",
  surfaceTertiary: "#262626",
  onSurfaceTertiary: "#D4D4D4",
  surfaceInverse: "#F5F5F5",
  onSurfaceInverse: "#0A0A0A",
  muted: "#8C8C8C",

  // Brand - Champagne Gold
  brand: "#DCCBAF",
  onBrand: "#0A0A0A",
  brandPrimary: "#DCCBAF",
  onBrandPrimary: "#0A0A0A",
  brandSecondary: "#A6977D",
  onBrandSecondary: "#0A0A0A",
  brandTertiary: "#332B1E",
  onBrandTertiary: "#DCCBAF",

  // Status
  success: "#2F6A4F",
  onSuccess: "#E6F4EA",
  warning: "#D98A3C",
  onWarning: "#FFF3E0",
  error: "#9B2226",
  onError: "#FFEBEE",
  info: "#4A4A4A",
  onInfo: "#E5E5E0",

  // Lines
  border: "#262626",
  borderStrong: "#3A3A3A",
  divider: "#1A1A1A",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fonts = {
  display: "serif", // Cormorant Garamond substitute (system serif)
  text: "System",
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Force dark since the whole app is dark-first
setColorScheme?.("dark");

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = "dark";
  return { scheme, colors: themes.dark };
}

export const colors = themes.dark;

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
