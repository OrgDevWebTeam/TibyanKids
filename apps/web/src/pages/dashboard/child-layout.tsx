import { NavLink, Outlet } from "react-router";
import { BAND_KEYS, childAge } from "@/features/children/child-profile";
import { Avatar } from "@/features/dashboard/parent-frame";
import { plural } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { useDashboard, useSelectedChild } from "./dashboard-context";

// The chosen child above the child's pages, with tabs between them (Figma "Parent Dashboard":
// Child context). Child growth, Weekly reports and Quran progress join the tabs with their APIs.

const TAB_CLASSES =
  "inline-flex min-h-11 items-center border-b-3 px-1 font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `${TAB_CLASSES} ${isActive ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"}`;

  return (
    <>
      <section
        aria-label={child.name}
        className="flex flex-col gap-4 rounded-button border border-line bg-surface px-5 pt-5"
      >
        <div className="flex items-center gap-4">
          <Avatar name={child.name} size="lg" />
          <div className="flex min-w-0 flex-col">
            <bdi className="truncate text-xl leading-7 font-bold text-ink">{child.name}</bdi>
            <span className="text-caption text-ink-muted">{details}</span>
          </div>
        </div>
        <nav aria-label={t.tabsLabel}>
          <ul className="flex gap-6 overflow-x-auto">
            <li>
              <NavLink to={base} end className={tabClass}>
                {t.tabs.home}
              </NavLink>
            </li>
            <li>
              <NavLink to={`${base}/tasks`} className={tabClass}>
                {t.tabs.tasks}
              </NavLink>
            </li>
          </ul>
        </nav>
      </section>
      <Outlet context={context} />
    </>
  );
}
