import { useLayoutEffect } from "react";
import { Outlet, ScrollRestoration, useMatches } from "react-router";
import { applyLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { useTheme } from "@/lib/theme";
import { OfflineBanner } from "./offline-banner";
import { RouteAnnouncer } from "./route-announcer";
import { SiteHeader } from "./site-header";

/**
 * A route's `handle` can mark it `bare`: the page draws its own header (the sign-in pages). With
 * `ownMeta` it also writes its own description (the landing page). With `followsTheme` the page
 * and the header take the visitor's light or dark mode (pages that draw their own frame apply it
 * themselves).
 */
type RouteHandle = { bare?: boolean; ownMeta?: boolean; followsTheme?: boolean } | undefined;

/** Frame of every localized page: language and direction, header, offline notice, then the page. */
export function LocaleLayout() {
  const { locale, dict } = useI18n();
  const handles = useMatches().map((match) => match.handle as RouteHandle);
  const bare = handles.some((handle) => handle?.bare === true);
  const ownMeta = handles.some((handle) => handle?.ownMeta === true);
  const [chosenTheme] = useTheme();
  const theme = handles.some((handle) => handle?.followsTheme === true) ? chosenTheme : "light";

  // Runs before the browser paints, so a language switch never shows the old direction.
  useLayoutEffect(() => applyLocale(locale), [locale]);

  // On the whole document, so the page background changes with the header and the page.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
  }, [theme]);

  return (
    <>
      {!ownMeta && <meta name="description" content={dict.meta.description} />}
      {!bare && <SiteHeader theme={theme} />}
      <OfflineBanner locale={locale} />
      <Outlet />
      <RouteAnnouncer />
      <ScrollRestoration />
    </>
  );
}
