import { AlertBanner, Button, EmptyState, Skeleton } from "@tibyan/ui";
import { PageTitle } from "@/components/page-title";
import { TaskCard } from "@/features/missions/task-card";
import { useChildMissions } from "@/features/missions/use-child-missions";
import { useI18n } from "@/i18n/locale-data";
import { useSelectedChild } from "./dashboard-context";

// Family Tasks (Figma "Parent Dashboard", section 2), with the parent's observation (P03,
// FR-FAM-002). Missions come from the child's lessons; the parent says how each one went.

export function Component() {
  const child = useSelectedChild();
  return <ChildTasks key={child.id} childId={child.id} />;
}

function ChildTasks({ childId }: { childId: string }) {
  const { dict, locale } = useI18n();
  const t = dict.familyTasks;
  const { state, announcement, reload, observe } = useChildMissions(childId, t.saved);

  const open = state.status === "ready" ? state.missions.filter((m) => m.status === "pending") : [];
  const past = state.status === "ready" ? state.missions.filter((m) => m.status !== "pending") : [];

  return (
    <>
      <PageTitle title={t.title} />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl leading-10 font-bold text-ink">{t.title}</h1>
        <p className="text-ink-muted">{t.subtitle}</p>
      </header>

      <p className="sr-only" role="status">
        {announcement}
      </p>

      {state.status === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

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
        <EmptyState title={t.emptyTitle} description={t.emptyBody} headingLevel={2} />
      )}

      {open.length > 0 && (
        <section aria-labelledby="tasks-open" className="flex flex-col gap-4">
          <h2 id="tasks-open" className="text-xl leading-7 font-bold text-ink">
            {t.sectionOpen}
          </h2>
          {open.map((mission) => (
            <TaskCard
              key={mission.id}
              t={t}
              locale={locale}
              mission={mission}
              onObserve={observe}
            />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="tasks-past" className="flex flex-col gap-4">
          <h2 id="tasks-past" className="text-xl leading-7 font-bold text-ink">
            {t.sectionPast}
          </h2>
          {past.map((mission) => (
            <TaskCard
              key={mission.id}
              t={t}
              locale={locale}
              mission={mission}
              onObserve={observe}
            />
          ))}
        </section>
      )}
    </>
  );
}
