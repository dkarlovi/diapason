import type { ColorScheme, StudioTheme } from "./ThemeConfig";

export interface HostThemeMessage {
  type: "diapason:theme";
  theme: string | null;
  scheme: ColorScheme;
}

export interface HostThemeUpdate {
  theme: StudioTheme | undefined;
  scheme: ColorScheme;
}
