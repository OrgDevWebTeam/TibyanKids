import { AlertBanner, Button, EmptyState, Skeleton } from "@tibyan/ui";
import { type ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import {
  BookOpenIcon,
  ChevronForwardIcon,
  EyeIcon,
  HeartIcon,
  PlayIcon,
  TargetIcon,
} from "@/features/dashboard/dashboard-icons";
import { dayProgress, pendingFromEarlier, todaysMissions } from "@/features/missions/mission-day";
import { type FamilyMission } from "@/features/missions/missions-api";
import { TaskCard, TaskRow } from "@/features/missions/task-card";
import { useChildMissions } from "@/features/missions/use-child-missions";
import { formatDate, formatNumber, formatTemplate } from "@/i18n/format";
import { useI18n } from "@/i18n/locale-data";
import { useSelectedChild } from "./dashboard-context";

// Family Tasks (Figma "Parent Dashboard", section 2), with the parent's observation (P03,
// FR-FAM-002): how a family task works, today's progress, observations still open from earlier
// days, then today's tasks. The week switcher, the morning, afternoon and evening groups, the
// unlock times and the week's value come with their APIs.

// Card: card/radius, border/subtle, 24px padding, Elevation/1.
const CARD =
  "rounded-button border border-line bg-surface p-6 shadow-[0_1px_3px_color-mix(in_srgb,var(--tibyan-shadow)_10%,transparent)]";

export function Component() {
  const child = useSelectedChild();
  return <ChildTasks key={child.id} childId={child.id} />;
}

function ChildTasks({ childId }: { childId: string }) {
  const { dict, locale } = useI18n();
  const t = dict.familyTasks;
  const { state, announcement, reload, observe } = useChildMissions(childId, t.saved);
  const now = new Date();
  const missions = state.status === "ready" ? state.missions : [];
  const today = todaysMissions(missions, now);
  const pending = pendingFromEarlier(missions, now);
  const progress = dayProgress(today);
  const progressText = formatTemplate(
    locale,
    t.dayProgress[new Intl.PluralRules(locale).select(progress.done)],
    progress,
  );

  const pendingMeta = (mission: FamilyMission) =>
    [
      formatDate(locale, new Date(mission.assignedAt), { weekday: "long" }),
      mission.domain && t.domains[mission.domain],
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageTitle title={t.title} />
      <header className="flex flex-col gap-1">
        <h1 className="text-[2rem] leading-10 font-bold text-ink">{t.title}</h1>
        <p className="leading-6 font-medium text-ink-muted">{t.subtitle}</p>
      </header>

      <ValueLoop />

      <p className="sr-only" role="status">
        {announcement}
      </p>

      {state.status === "loading" && (
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
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

      {state.status === "ready" && today.length === 0 && pending.length === 0 && (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} headingLevel={2} />
      )}

      {today.length > 0 && (
        // Day progress: how many of today's missions are answered, with a meter.
        <div className={`flex flex-col gap-3 ${CARD}`}>
          <p className="text-lg leading-6 font-bold text-ink">{progressText}</p>
          <div
            role="meter"
            aria-label={progressText}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="h-2 overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-observations" className={`flex flex-col gap-4 ${CARD}`}>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-link">
              <EyeIcon />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 id="pending-observations" className="text-lg leading-6 font-bold text-ink">
                {t.pendingTitle}
              </h2>
              <p className="text-caption text-ink-muted">{t.pendingSub}</p>
            </div>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-1 text-caption leading-none font-extrabold text-on-secondary">
              {formatNumber(locale, pending.length)}
            </span>
          </div>
          {pending.map((mission) => (
            <TaskRow
              key={mission.id}
              t={t}
              mission={mission}
              meta={pendingMeta(mission)}
              headingLevel={3}
              onObserve={observe}
            />
          ))}
        </section>
      )}

      {today.length > 0 && (
        <section aria-labelledby="tasks-today" className="flex flex-col gap-4">
          <h2 id="tasks-today" className="sr-only">
            {t.todayHeading}
          </h2>
          {today.map((mission) => (
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

/** How a family task works: story, decision, concept, then the real-life mission. */
function ValueLoop() {
  const { dict } = useI18n();
  const t = dict.familyTasks.loop;
  const steps: { icon: ReactNode; label: string }[] = [
    { icon: <PlayIcon />, label: t.story },
    { icon: <TargetIcon />, label: t.decision },
    { icon: <BookOpenIcon />, label: t.concept },
    { icon: <HeartIcon />, label: t.mission },
  ];

  return (
    <section aria-labelledby="value-loop" className={`flex flex-col gap-4 ${CARD}`}>
      <h2 id="value-loop" className="leading-6 font-bold text-ink">
        {t.title}
      </h2>
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-4">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            {index > 0 && <ChevronForwardIcon className="size-5 shrink-0 text-ink-muted" />}
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-link">
              {step.icon}
            </span>
            <span className="leading-6 font-bold text-ink">{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
