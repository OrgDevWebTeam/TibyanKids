import { Skeleton } from "@tibyan/ui";
import { useState } from "react";
import {
  Outlet,
  redirect,
  useLoaderData,
  useNavigation,
  type LoaderFunctionArgs,
} from "react-router";
import { LoadFailed } from "@/components/load-failed";
import { type ChildDetails, listChildDetails } from "@/features/children/children-api";
import { childAge, sortByAge } from "@/features/children/child-profile";
import { ParentSidebar, ParentTopBar } from "@/features/dashboard/parent-frame";
import { plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { type ApiResult } from "@/lib/api/client";
import { areaRedirect } from "@/lib/session/area-access";
import { getSession, useSession } from "@/lib/session/session-store";
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

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ParentTopBar parentName={parentName} />
      <div className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col gap-6 px-4 py-6 lg:flex-row lg:gap-8 lg:px-8">
        {kids.length > 0 && (
          <aside className="lg:w-72 lg:shrink-0">
            <div className="rounded-button border border-line bg-surface p-4 lg:sticky lg:top-6">
              <ParentSidebar kids={sidebarKids} selectedId={child?.id} onSelect={setSelectedId} />
            </div>
          </aside>
        )}
        <main aria-busy={isLoading} className="flex min-w-0 flex-1 flex-col gap-6">
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
