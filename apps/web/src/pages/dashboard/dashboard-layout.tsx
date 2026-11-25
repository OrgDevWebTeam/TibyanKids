import { Skeleton } from "@tibyan/ui";
import { useEffect, useId, useState } from "react";
import {
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  useNavigation,
  type LoaderFunctionArgs,
} from "react-router";
import { LoadFailed } from "@/components/load-failed";
import { type ChildDetails, listChildDetails } from "@/features/children/children-api";
import { childAge, sortByAge } from "@/features/children/child-profile";
import { ParentSidebar, ParentTopBar, SidebarDrawer } from "@/features/dashboard/parent-frame";
import { plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { type ApiResult } from "@/lib/api/client";
import { areaRedirect } from "@/lib/session/area-access";
import { getSession, useSession } from "@/lib/session/session-store";
import { useTheme } from "@/lib/theme";
import { type DashboardContext } from "./dashboard-context";

// The parent dashboard's frame (Figma "Parent Dashboard"): top bar, the children in the sidebar,
// then the page. Its pages get the children and the chosen child through the outlet context.

type LayoutData = { children: ApiResult<ChildDetails[]> };

export async function loader({
  params,
  request,
}: LoaderFunctionArgs): Promise<LayoutData | Response> {
  const session = getSession();
  // A visitor without a session logs in first; the API checks every permission itself.
  const target = areaRedirect("family", session);
  if (target) return redirect(`/${params.locale}/${target}`);
  if (session.status !== "signed-in") return redirect(`/${params.locale}/sign-in`);

  const result = await listChildDetails(session.token);
  if (!result.ok) return { children: result };

  const children = sortByAge(result.data);
  // A family with no children starts by adding one (J-01).
  const addChild = `/${params.locale}/dashboard/add-child`;
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  if (children.length === 0 && path !== addChild) return redirect(addChild);
  return { children: { ok: true, data: children } };
}

export function Component() {
  const data = useLoaderData<LayoutData>();
  const session = useSession();
  const isLoading = useNavigation().state === "loading";
  const parentName = session.status === "signed-in" ? session.name : undefined;

  const { locale, dict } = useI18n();
  const kids = data.children.ok ? data.children.data : [];
  // The dashboard opens on the youngest child (PD/Sidebar: the first child is chosen).
  const [selectedId, setSelectedId] = useState(kids[0]?.id);
  const child = kids.find((item) => item.id === selectedId) ?? kids[0];
  const today = new Date();
  const sidebarKids = kids.map((kid) => {
    const age = childAge(kid.dateOfBirth, today);
    const details = age === undefined ? "" : plural(locale, age, dict.dashboard.age);
    return { id: kid.id, name: kid.name, details };
  });

  const [theme, changeTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const { pathname } = useLocation();

  // A new page closes the phone menu.
  useEffect(() => setMenuOpen(false), [pathname]);

  function choose(childId: string) {
    setSelectedId(childId);
    setMenuOpen(false);
  }

  const sidebar = kids.length > 0 && (
    <ParentSidebar kids={sidebarKids} selectedId={child?.id} onSelect={choose} />
  );

  return (
    // Every dashboard screen has a light and a dark version in the design.
    <div
      data-theme={theme === "dark" ? "dark" : undefined}
      className="flex min-h-dvh flex-col bg-background text-ink"
    >
      <ParentTopBar
        parentName={parentName}
        theme={theme}
        onThemeChange={changeTheme}
        onOpenMenu={() => setMenuOpen(true)}
        menuId={menuId}
      />
      <SidebarDrawer
        id={menuId}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        theme={theme}
        onThemeChange={changeTheme}
      >
        {sidebar}
      </SidebarDrawer>
      <div className="flex flex-1">
        {/* PD/Sidebar: 264px, full height, border/subtle at its end. */}
        {sidebar && (
          <aside className="hidden w-66 shrink-0 border-e border-line bg-surface px-4 py-6 lg:block">
            <div className="sticky top-24">{sidebar}</div>
          </aside>
        )}
        {/* Main: 32px around (48px below), 32px between blocks. */}
        <main
          aria-busy={isLoading}
          className="flex min-w-0 flex-1 flex-col gap-8 px-4 pt-6 pb-12 lg:px-8 lg:pt-8"
        >
          {!data.children.ok && <LoadFailed />}
          {data.children.ok &&
            (isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <Outlet
                context={{ kids, child, selectChild: setSelectedId } satisfies DashboardContext}
              />
            ))}
        </main>
      </div>
    </div>
  );
}
