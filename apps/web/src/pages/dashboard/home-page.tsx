import { AlertBanner, Button, Skeleton } from "@tibyan/ui";
import { Link } from "react-router";
import { PageTitle } from "@/components/page-title";
import { fill } from "@/features/auth/auth-rules";
import { type ChildDetails } from "@/features/children/children-api";
import { ListChecksIcon } from "@/features/dashboard/dashboard-icons";
import { dayPart } from "@/features/dashboard/dashboard-rules";
import { TaskCard } from "@/features/missions/task-card";
import { useChildMissions } from "@/features/missions/use-child-missions";
import { useI18n } from "@/i18n/locale-data";
import { useSession } from "@/lib/session/session-store";
import { useSelectedChild } from "./dashboard-context";

// P01, the dashboard home (Figma "Parent Dashboard", section 1): a greeting and Today's tasks,
// which shows the child's open missions with the parent's one-tap observation (the API gives no
// time of day for a mission). The weekly summary, insight, teacher messages, Quran progress and
// growth map come with their APIs.

/** Keeps a name in its own direction inside a sentence of the other language. */
const isolate = (text: string) => `\u2068${text}\u2069`;

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
  const part = dayPart(new Date());
  const { state, announcement, reload, observe } = useChildMissions(child.id, tasks.saved);
  const open = state.status === "ready" ? state.missions.filter((m) => m.status === "pending") : [];

  return (
    <>
      <PageTitle title={dict.screens.dashboard} />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-10 font-bold text-ink">
          {name ? fill(t.greeting[part], { name: isolate(name) }) : t.greetingNoName[part]}
        </h1>
        <p className="text-ink-muted">{fill(t.intro, { child: isolate(child.name) })}</p>
      </header>

      <section aria-labelledby="priorities" className="flex flex-col gap-4">
        <h2 id="priorities" className="text-xl leading-7 font-bold text-ink">
          {t.priorities}
        </h2>

        <article
          aria-labelledby="today-tasks"
          className="flex flex-col gap-4 rounded-button border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-secondary text-on-secondary">
                <ListChecksIcon />
              </span>
              <div className="flex flex-col">
                <h3 id="today-tasks" className="text-lg leading-7 font-bold text-ink">
                  {t.todayTasks}
                </h3>
                <p className="text-caption text-ink-muted">{t.todayTasksSub}</p>
              </div>
            </div>
            <Link
              to={`/${locale}/dashboard/tasks`}
              className="rounded-control leading-6 font-bold text-link underline decoration-2 underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {t.allTasks}
            </Link>
          </div>

          <p className="sr-only" role="status">
            {announcement}
          </p>

          {state.status === "loading" && <Skeleton className="h-40 w-full" />}

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

          {state.status === "ready" && state.missions.length === 0 && (
            <p className="text-ink-muted">{tasks.emptyBody}</p>
          )}

          {state.status === "ready" && state.missions.length > 0 && open.length === 0 && (
            <p className="text-ink-muted">{t.allCaughtUp}</p>
          )}

          {open.map((mission) => (
            <TaskCard
              key={mission.id}
              t={tasks}
              locale={locale}
              mission={mission}
              onObserve={observe}
              headingLevel={4}
            />
          ))}
        </article>
      </section>
    </>
  );
}
