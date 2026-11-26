import { redirect, type RouteObject } from "react-router";
import { AreaShell } from "@/components/area-shell";
import { LocaleLayout } from "@/components/locale-layout";
import { LOCALE_ROUTE_ID, loadLocale } from "@/i18n/locale-data";
import { preferredLocale } from "@/i18n/preferred-locale";
import { areaRedirect, type Area } from "@/lib/session/area-access";
import { getSession } from "@/lib/session/session-store";
import { ErrorPage } from "@/pages/error-page";
import { GlobalErrorPage } from "@/pages/global-error-page";
import { LoadingPage } from "@/pages/loading-page";
import { NotFoundPage } from "@/pages/not-found-page";

const area = (name: Area, children: RouteObject[]): RouteObject => ({
  element: <AreaShell area={name} />,
  // Runs before any page of the area loads, so a visitor without the right session never sees it.
  loader: ({ params }) => {
    const target = areaRedirect(name, getSession());
    return target ? redirect(`/${params.locale}/${target}`) : null;
  },
  children,
});

// Development-only pages: design review, and a test parent session until real sign-in exists.
// Production bundles do not contain them.
const DEV_ROUTES: RouteObject[] = import.meta.env.DEV
  ? [
      { path: "dev/ui", lazy: () => import("@/pages/dev/ui-page") },
      { path: "dev/rtl", lazy: () => import("@/pages/dev/rtl-page") },
      { path: "dev/session", lazy: () => import("@/pages/dev/session-page") },
    ]
  : [];

// `lazy` loads a screen's module when it is first opened and uses its `Component` export, so a
// visit downloads only what it shows. Screen IDs (G01, C01...) come from the UI Screens Spec.
export const routes: RouteObject[] = [
  {
    errorElement: <GlobalErrorPage />,
    HydrateFallback: LoadingPage,
    children: [
      // The loader always redirects; the router still expects a leaf route to have a component.
      { index: true, loader: () => redirect(`/${preferredLocale()}`), Component: LoadingPage },
      {
        id: LOCALE_ROUTE_ID,
        path: ":locale",
        loader: loadLocale,
        Component: LocaleLayout,
        children: [
          {
            errorElement: <ErrorPage />,
            children: [
              // G01: the landing page draws its own header and footer (`bare`) and writes its own
              // title and description (`ownMeta`).
              {
                index: true,
                lazy: () => import("@/pages/landing-page"),
                handle: { bare: true, ownMeta: true },
              },
              { path: "maintenance", lazy: () => import("@/pages/maintenance-page") },

              // G06 and G03: log in and sign up. One page for both paths, so switching between
              // them keeps the page and slides its card. It has its own header (`bare`).
              {
                lazy: () => import("@/pages/auth-page"),
                handle: { bare: true },
                children: [{ path: "sign-in" }, { path: "sign-up" }],
              },

              // G08: the profile picker. Private. Adding a child (O01) is part of the dashboard now;
              // its old address forwards there. The other onboarding steps (O02–O04) come once
              // their APIs exist.
              area("family", [
                {
                  path: "profiles",
                  // Between sign-in and the dashboard, so it keeps the mode the parent chose.
                  handle: { followsTheme: true },
                  lazy: () => import("@/pages/profiles-page"),
                },
                {
                  path: "onboarding/child",
                  loader: ({ params }) => redirect(`/${params.locale}/dashboard/add-child`),
                  Component: LoadingPage,
                },
              ]),

              // P01–P03: the parent dashboard (Figma "Parent Dashboard"). Private: its frame's
              // loader checks the session. It draws its own top bar and sidebar (`bare`). The
              // child chosen in the sidebar stays in memory, not in the address. The other
              // sections come with their APIs.
              {
                path: "dashboard",
                handle: { bare: true },
                lazy: () => import("@/pages/dashboard/dashboard-layout"),
                children: [
                  {
                    // The chosen child and the tabs between the child's pages.
                    lazy: () => import("@/pages/dashboard/child-layout"),
                    children: [
                      { index: true, lazy: () => import("@/pages/dashboard/home-page") },
                      { path: "tasks", lazy: () => import("@/pages/dashboard/tasks-page") },
                    ],
                  },
                  { path: "profile", lazy: () => import("@/pages/dashboard/profile-page") },
                  { path: "add-child", lazy: () => import("@/pages/dashboard/add-child-page") },
                ],
              },

              // C01–C10: child area. Private.
              // No third-party scripts, trackers or session replay in this area (SEC-009, SEC-011).
              // The lesson journey (Figma "Child World · 6–8", section 5) fills the screen with its
              // own header (`bare`). The story it shows stays in memory, not in the address.
              area("child", [
                { path: "today", lazy: () => import("@/pages/today-page") },
                {
                  path: "lesson",
                  handle: { bare: true },
                  lazy: () => import("@/pages/lesson-page"),
                },
              ]),

              // Email verification and password recovery (G04, G07), and the parent (P01–P09),
              // teacher (T01–T05) and staff (A01–A10) areas are added with their tasks.

              ...DEV_ROUTES,
              { path: "*", Component: NotFoundPage },
            ],
          },
        ],
      },
    ],
  },
];
