import { NavLink, Outlet } from "react-router";
import { BAND_KEYS, childAge } from "@/features/children/child-profile";
import { Avatar } from "@/features/dashboard/parent-frame";
import { plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { useDashboard, useSelectedChild } from "./dashboard-context";

// The chosen child above the child's pages, with tabs between them (Figma "Parent Dashboard":
// Child context). Its "Week 12 of the journey" and "Enter child interface", and the Child growth,
// Weekly reports and Quran progress tabs, come with their APIs.

export function Component() {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;
  const context = useDashboard();
  const child = useSelectedChild();

  const age = childAge(child.dateOfBirth, new Date());
  const band = child.ageBand && dict.landing.preview[BAND_KEYS[child.ageBand]].name;
  const details = [age === undefined ? undefined : plural(locale, age, t.age), band]
    .filter(Boolean)
    .join(" · ");
  const base = `/${locale}/dashboard`;

  return (
    <>
      <section aria-label={child.name} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={child.name} size="header" />
          <div className="flex min-w-0 flex-col">
            <bdi className="truncate text-2xl leading-8 font-bold text-ink">{child.name}</bdi>
            <span className="text-sm leading-[22px] font-medium text-ink-muted">{details}</span>
          </div>
        </div>
        {/* Child navigation: the chosen tab's label in brand with a 3px underline; the others
            with a 1px baseline, all over the tabs' 1px baseline. */}
        <nav aria-label={t.tabsLabel} className="border-b border-line">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            <Tab to={base} end label={t.tabs.home} />
            <Tab to={`${base}/tasks`} label={t.tabs.tasks} />
          </ul>
        </nav>
      </section>
      <Outlet context={context} />
    </>
  );
}

function Tab({ to, end, label }: { to: string; end?: boolean; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          [
            "flex min-h-11 items-center rounded-t-sm px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
            isActive
              ? "border-b-3 border-primary leading-5 font-bold text-link"
              : "border-b border-line leading-6 font-medium text-ink-muted hover:text-ink",
          ].join(" ")
        }
      >
        {label}
      </NavLink>
    </li>
  );
}
