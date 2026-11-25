import { useLayoutEffect } from "react";
import { Outlet, ScrollRestoration, useMatches } from "react-router";
import { applyLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/locale-data";
import { OfflineBanner } from "./offline-banner";
import { RouteAnnouncer } from "./route-announcer";
import { SiteHeader } from "./site-header";

/** A route's `handle` can mark it `bare`: the page draws its own header (the sign-in pages). */
type RouteHandle = { bare?: boolean } | undefined;

/** Frame of every localized page: language and direction, header, offline notice, then the page. */
export function LocaleLayout() {
  const { locale, dict } = useI18n();
  const bare = useMatches().some((match) => (match.handle as RouteHandle)?.bare === true);

  // Runs before the browser paints, so a language switch never shows the old direction.
  useLayoutEffect(() => applyLocale(locale), [locale]);

  return (
    <>
      <meta name="description" content={dict.meta.description} />
      {!bare && <SiteHeader />}
      <OfflineBanner locale={locale} />
      <Outlet />
      <RouteAnnouncer />
      <ScrollRestoration />
    </>
  );
}
