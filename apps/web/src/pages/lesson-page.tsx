import { AlertBanner, Button, EmptyState, buttonClasses } from "@tibyan/ui";
import { useEffect, useReducer, useRef } from "react";
import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { LoadFailed } from "@/components/load-failed";
import { PageTitle } from "@/components/page-title";
import "@/features/story/child-world.css";
import { JourneyBar } from "@/features/story/journey-bar";
import {
  type JourneyScreen,
  journeyReducer,
  saveJourney,
  savedJourney,
} from "@/features/story/journey-state";
import {
  DecisionStep,
  EmptyStage,
  LessonComplete,
  MissionCard,
} from "@/features/story/lesson-steps";
import { PlanetBadge } from "@/features/story/planet";
import { SpaceBackground } from "@/features/story/space-background";
import { type StoryJourney, completeStory, getStoryJourney } from "@/features/story/story-api";
import { chosenStory } from "@/features/story/story-choice";
import { CloseGlyph } from "@/features/story/story-icons";
import { useI18n } from "@/i18n/locale-data";
import { type ApiResult } from "@/lib/api/client";
import { getSession, useSession } from "@/lib/session/session-store";

// C-area lesson journey (KAN-39, FR-STORY-002): Figma "Child World · 6–8", section 5. A story,
// its decision challenge, a learning activity, then the real-life mission the story gives, and
// "Lesson complete". Always the dark scene; it draws its own header (`bare`). The story comes from
// memory (`openStory`), not the address. The way in is the Space home and its planets (sections 3
// and 4), which come with their APIs.

type StoryData = { childId: string; journey: ApiResult<StoryJourney> };

export async function loader({ params }: LoaderFunctionArgs): Promise<StoryData | Response> {
  const session = getSession();
  // The child area's own check runs beside this loader, not before it.
  if (session.status !== "signed-in") return redirect(`/${params.locale}/sign-in`);
  const child = session.activeChild;
  if (!child) return redirect(`/${params.locale}/profiles`);
  const storyId = chosenStory();
  if (!storyId) return redirect(`/${params.locale}/today`);

  const journey = await getStoryJourney(session.token, storyId, child.id);
  return { childId: child.id, journey };
}

export function Component() {
  const { childId, journey } = useLoaderData<StoryData>();
  const { dict, locale } = useI18n();

  return (
    <div className="child-world" data-theme="dark">
      <SpaceBackground />
      <PageTitle title={journey.ok ? journey.data.title : dict.story.lesson} />
      {journey.ok ? (
        // A new story starts a new journey.
        <Journey key={journey.data.storyId} childId={childId} journey={journey.data} />
      ) : (
        <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-8">
          {/* No story for this child: not published, or for another age (the API answers 404). */}
          {journey.error.kind === "not-found" ? (
            <EmptyState
              headingLevel={1}
              title={dict.notFound.title}
              description={dict.notFound.body}
              action={
                <Link to={`/${locale}/today`} className={buttonClasses("fun")}>
                  {dict.story.backToSpace}
                </Link>
              }
            />
          ) : (
            <LoadFailed />
          )}
        </main>
      )}
    </div>
  );
}

function Journey({ childId, journey }: { childId: string; journey: StoryJourney }) {
  const { dict, locale } = useI18n();
  const t = dict.story;
  const session = useSession();
  const [state, dispatch] = useReducer(journeyReducer, undefined, () =>
    savedJourney(childId, journey.storyId, journey.challenge !== undefined),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownScreen = useRef<JourneyScreen>(state.screen);

  // The place is kept, so leaving the lesson and coming back resumes it.
  useEffect(() => saveJourney(childId, journey.storyId, state), [childId, journey.storyId, state]);

  // A new screen moves the focus to its heading; the first one keeps the page's normal start.
  useEffect(() => {
    if (shownScreen.current === state.screen) return;
    shownScreen.current = state.screen;
    headingRef.current?.focus();
  }, [state.screen]);

  async function finishStory() {
    if (session.status !== "signed-in") return;
    dispatch({ type: "complete-started" });
    const result = await completeStory(session.token, childId, journey.storyId);
    dispatch(
      result.ok
        ? { type: "complete-succeeded", mission: result.data }
        : { type: "complete-failed" },
    );
  }

  const next = () => dispatch({ type: "next" });
  const mission = state.mission?.mission ?? journey.mission;
  const home = `/${locale}/today`;
  // The design's main action: 360px, the whole width on phones.
  const action = "w-full md:w-90";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[90rem] flex-col gap-4 px-4 py-4 md:gap-7 md:px-12 md:py-8">
      {state.screen !== "complete" && (
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
          <Link
            to={home}
            aria-label={t.exit}
            className="grid size-12 place-items-center justify-self-start rounded-full border border-[var(--cw-glass-border)] bg-[var(--cw-glass-fill)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus md:size-14"
          >
            <CloseGlyph className="size-6" />
          </Link>
          <JourneyBar
            screen={state.screen}
            labels={{ list: t.stepsLabel, steps: t.steps, status: t.stepStatus }}
          />
          <span className="justify-self-end">
            <PlanetBadge domain={mission.domain} />
          </span>
        </header>
      )}

      <section className="flex flex-1 flex-col items-center justify-center gap-4 md:gap-6">
        {state.screen === "story" && (
          <EmptyStage name={t.steps.story} shape="video" headingRef={headingRef} />
        )}
        {state.screen === "decision" &&
          (journey.challenge ? (
            <DecisionStep
              challenge={journey.challenge}
              choice={state.choice}
              onChoose={(choice) => dispatch({ type: "choose", choice })}
              headingRef={headingRef}
            />
          ) : (
            <EmptyStage name={t.steps.decision} shape="pad" headingRef={headingRef} />
          ))}
        {state.screen === "activity" && (
          <EmptyStage name={t.steps.activity} shape="pad" headingRef={headingRef} />
        )}
        {state.screen === "mission" && (
          <MissionCard
            mission={mission}
            labels={{ atHome: t.missionAtHome, askGrownUp: t.askGrownUp }}
            headingRef={headingRef}
          />
        )}
        {state.screen === "complete" && (
          <LessonComplete domain={mission.domain} title={t.complete} headingRef={headingRef} />
        )}
      </section>

      <div className="flex flex-col items-center gap-3">
        {state.screen === "activity" && state.completeFailed && (
          <div className="w-full max-w-xl">
            <AlertBanner tone="danger">{t.saveFailed}</AlertBanner>
          </div>
        )}
        {(state.screen === "story" || (state.screen === "decision" && !journey.challenge)) && (
          <Button variant="fun" className={action} onClick={next}>
            {t.next}
          </Button>
        )}
        {state.screen === "decision" && journey.challenge && (
          <Button
            variant="fun"
            className={action}
            disabled={state.choice === undefined}
            onClick={next}
          >
            {t.check}
          </Button>
        )}
        {state.screen === "activity" && (
          <Button
            variant="fun"
            className={action}
            loading={state.completing}
            onClick={() => void finishStory()}
          >
            {t.next}
          </Button>
        )}
        {state.screen === "mission" && (
          // "Do it later" also ends the lesson: the mission stays open for the grown-up to observe.
          // On phones the two actions stack, as in the design.
          <div className="flex w-full flex-col items-center gap-3 md:w-auto md:flex-row">
            <Button variant="fun" className="w-full md:w-75" onClick={next}>
              {t.didIt}
            </Button>
            <Button variant="ghost" onClick={next}>
              {t.later}
            </Button>
          </div>
        )}
        {state.screen === "complete" && (
          <Link to={home} className={`${buttonClasses("fun")} ${action}`}>
            {t.backToSpace}
          </Link>
        )}
      </div>
    </main>
  );
}
