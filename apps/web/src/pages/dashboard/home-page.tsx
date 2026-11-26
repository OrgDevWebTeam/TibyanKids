import { AlertBanner, Button, Skeleton } from "@tibyan/ui";
import { type ReactNode } from "react";
import { Link } from "react-router";
import { PageTitle } from "@/components/page-title";
import { fill } from "@/features/auth/auth-rules";
import { type ChildDetails } from "@/features/children/children-api";
import { EyeIcon, ListChecksIcon } from "@/features/dashboard/dashboard-icons";
import { dayPart } from "@/features/dashboard/dashboard-rules";
import { dayProgress, pendingFromEarlier, todaysMissions } from "@/features/missions/mission-day";
import { type FamilyMission } from "@/features/missions/missions-api";
import { TaskRow } from "@/features/missions/task-card";
import { useChildMissions } from "@/features/missions/use-child-missions";
import { formatDate, formatNumber, formatTemplate } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { useSession } from "@/lib/session/session-store";
import { useSelectedChild } from "./dashboard-context";

// P01, the dashboard home (Figma "Parent Dashboard", section 1): the greeting, then Today's
// priorities: Today's tasks (answered today, and open ones with the one-tap observation) and
// Pending observations (still open from an earlier day). The weekly review, status at a glance,
// insight, teacher messages, Quran progress and growth map come with their APIs.

/** Keeps a name in its own direction inside a sentence of the other language. */
const isolate = (text: string) => `⁨${text}⁩`;

// Card: card/radius, border/subtle, 24px padding, 16px gap, Elevation/1.
const CARD =
  "flex flex-col gap-4 rounded-button border border-line bg-surface p-6 shadow-[0_1px_3px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]";

export function Component() {
  const child = useSelectedChild();
  return <Home key={child.id} child={child} />;
}

function Home({ child }: { child: ChildDetails }) {
  const { dict, locale } = useI18n();
  const t = dict.dashboard;
  const tasks = dict.familyTasks;
  const session = useSession();
  const name = session.status === "signed-in" ? session.name : undefined;
  const now = new Date();
  const part = dayPart(now);
  const { state, announcement, reload, observe } = useChildMissions(child.id, tasks.saved);
  const missions = state.status === "ready" ? state.missions : [];
  const today = todaysMissions(missions, now);
  const pending = pendingFromEarlier(missions, now);
  const progress = dayProgress(today);

  /** The line under a task: its day (for an earlier one), its domain, and the parent's answer. */
  const meta = (mission: FamilyMission, withDay = false) =>
    [
      withDay ? formatDate(locale, new Date(mission.assignedAt), { weekday: "long" }) : undefined,
      mission.domain && tasks.domains[mission.domain],
      mission.observation && tasks.answered[mission.observation.status],
    ]
      .filter(Boolean)
      .join(" · ");

  // States · Dashboard loading: the page's shape in grey, and what is happening underneath. Only
  // the blocks this page shows; the status card and the insight come with their APIs.
  if (state.status === "loading") {
    return (
      <>
        <PageTitle title={dict.screens.dashboard} />
        <div aria-hidden="true" className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full max-w-90" />
            <Skeleton className="h-4 w-full max-w-120" />
          </div>
          <Skeleton className="h-6 w-48" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={CARD}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full!" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-13 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-13 w-full" />
            </div>
          </div>
        </div>
        {/* Body Small with the loader: 14/22, 14/24 in Arabic. */}
        <p
          role="status"
          className="flex items-center gap-2 text-sm leading-[22px] font-medium text-ink-muted rtl:leading-6"
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-e-transparent motion-reduce:animate-none"
          />
          {t.gathering}
        </p>
      </>
    );
  }

  return (
    <>
      <PageTitle title={dict.screens.dashboard} />
      <header className="flex flex-col gap-1">
        <h1 className="text-[2rem] leading-10 font-bold text-ink">
          {name ? fill(t.greeting[part], { name: isolate(name) }) : t.greetingNoName[part]}
        </h1>
        <p className="leading-6 font-medium text-ink-muted">
          {fill(t.intro, { child: isolate(child.name) })}
        </p>
      </header>

      <section aria-labelledby="priorities" className="flex flex-col gap-6">
        <div className="flex flex-col">
          <h2 id="priorities" className="text-xl leading-7 font-bold text-ink">
            {t.priorities}
          </h2>
          {state.status === "ready" && progress.total > 0 && (
            <p className="text-sm leading-[22px] font-medium text-ink-muted">
              {formatTemplate(locale, t.progress, progress)}
            </p>
          )}
        </div>

        <p className="sr-only" role="status">
          {announcement}
        </p>

        {state.status === "failed" && (
          <AlertBanner
            tone="danger"
            action={
              <Button variant="secondary" onClick={() => void reload()}>
                {dict.common.retry}
              </Button>
            }
          >
            {dict.common.loadFailed}
          </AlertBanner>
        )}

        {/* Priorities grid: two columns; this column holds the family's tasks. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <article aria-labelledby="today-tasks" className={CARD}>
              <CardHeader
                id="today-tasks"
                icon={<ListChecksIcon />}
                title={t.todayTasks}
                sub={t.todayTasksSub}
                end={
                  <Link
                    to={`/${locale}/dashboard/tasks`}
                    className="inline-flex min-h-11 items-center rounded-sm px-1 leading-6 font-bold text-link underline decoration-2 underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {t.allTasks}
                  </Link>
                }
              />
              {state.status === "ready" && today.length === 0 && (
                <p className="text-ink-muted">
                  {missions.length === 0 ? tasks.emptyBody : t.allCaughtUp}
                </p>
              )}
              {today.map((mission) => (
                <TaskRow
                  key={mission.id}
                  t={tasks}
                  locale={locale}
                  mission={mission}
                  meta={meta(mission)}
                  onObserve={observe}
                />
              ))}
            </article>

            {pending.length > 0 && (
              <article aria-labelledby="pending-observations" className={CARD}>
                <CardHeader
                  id="pending-observations"
                  icon={<EyeIcon />}
                  title={tasks.pendingTitle}
                  sub={tasks.pendingSub}
                  end={
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-1 text-caption leading-none font-extrabold text-on-secondary">
                      {formatNumber(locale, pending.length)}
                    </span>
                  }
                />
                {pending.map((mission) => (
                  <TaskRow
                    key={mission.id}
                    t={tasks}
                    locale={locale}
                    mission={mission}
                    meta={meta(mission, true)}
                    onObserve={observe}
                  />
                ))}
              </article>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/** A card's header: the icon bubble, the title (H5) and its line, and an optional end item. */
function CardHeader({
  id,
  icon,
  title,
  sub,
  end,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  sub: string;
  end?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-link">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 id={id} className="text-lg leading-6 font-bold text-ink">
          {title}
        </h3>
        <p className="text-caption text-ink-muted">{sub}</p>
      </div>
      {end}
    </div>
  );
}
