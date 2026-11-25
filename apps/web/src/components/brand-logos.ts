import logoArDarkUrl from "@/assets/landing/logo-ar-on-dark.webp";
import logoEnDarkUrl from "@/assets/landing/logo-en-on-dark.webp";
import logoArUrl from "@/assets/tibyan-logo-ar.svg";
import logoEnUrl from "@/assets/tibyan-logo.svg";
import { type Locale } from "@/i18n/config";
import { type Theme } from "@/lib/theme";

/**
 * The logo for each colour mode and language (PD/Logo): the design system's logos in light mode,
 * the on-dark logos from the brand assets in dark mode. Widths are at the image's own height.
 */
export const LOGOS: Record<
  Theme,
  Record<Locale, { src: string; width: number; height: number }>
> = {
  light: {
    ar: { src: logoArUrl, width: 173, height: 40 },
    en: { src: logoEnUrl, width: 210, height: 40 },
  },
  dark: {
    ar: { src: logoArDarkUrl, width: 833, height: 192 },
    en: { src: logoEnDarkUrl, width: 1001, height: 192 },
  },
};
