import { type AssignedMission } from "./story-api";

// The lesson journey of Figma "Child World · 6–8", section 5: four steps shown in the journey
// bar (CW/Journey steps), then the "Lesson complete" screen. The child moves forward only; the way
// out is the header's close button, and coming back to the same story resumes where they left it.

export const JOURNEY_STEPS = ["story", "decision", "activity", "mission"] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];
export type JourneyScreen = JourneyStep | "complete";

export type JourneyState = {
  screen: JourneyScreen;
  /** The story has a decision challenge (a package may have none). */
  hasChallenge: boolean;
  /** The option the child picked in the decision challenge, by its position. */
  choice?: number;
  /** The mission the API gave when the story was completed. */
  mission?: AssignedMission;
  /** True while the API records the finished story. */
  completing: boolean;
  /** The finished story could not be recorded; the child can try again. */
  completeFailed: boolean;
};

export type JourneyAction =
  | { type: "next" }
  | { type: "choose"; choice: number }
  | { type: "complete-started" }
  | { type: "complete-succeeded"; mission?: AssignedMission }
  | { type: "complete-failed" };

export function startJourney(hasChallenge: boolean): JourneyState {
  return { screen: "story", hasChallenge, completing: false, completeFailed: false };
}

const AFTER: Record<JourneyScreen, JourneyScreen> = {
  story: "decision",
  decision: "activity",
  // The activity's Next records the story first (`complete-*`), which opens the mission.
  activity: "activity",
  mission: "complete",
  complete: "complete",
};

export function journeyReducer(state: JourneyState, action: JourneyAction): JourneyState {
  switch (action.type) {
    case "next":
      // The decision moves on only once the child picked an option.
      if (state.screen === "decision" && state.hasChallenge && state.choice === undefined) {
        return state;
      }
      return { ...state, screen: AFTER[state.screen] };
    case "choose":
      return state.screen === "decision" ? { ...state, choice: action.choice } : state;
    case "complete-started":
      return state.screen === "activity"
        ? { ...state, completing: true, completeFailed: false }
        : state;
    case "complete-succeeded":
      return state.screen === "activity"
        ? { ...state, screen: "mission", mission: action.mission, completing: false }
        : state;
    case "complete-failed":
      return state.screen === "activity"
        ? { ...state, completing: false, completeFailed: true }
        : state;
  }
}

/** done, current or upcoming, for one dot of the journey bar. */
export function stepState(step: JourneyStep, screen: JourneyScreen): "done" | "current" | "next" {
  if (screen === "complete") return "done";
  const at = JOURNEY_STEPS.indexOf(screen);
  const index = JOURNEY_STEPS.indexOf(step);
  if (index < at) return "done";
  return index === at ? "current" : "next";
}

// Where each child stopped in each story, so leaving and coming back resumes the journey. In
// memory only: it goes with the tab, like the session, and nothing about the child is stored.
const places = new Map<string, JourneyState>();

const placeKey = (childId: string, storyId: string) => `${childId}:${storyId}`;

/** The journey to resume for this child and story, or a new one. */
export function savedJourney(
  childId: string,
  storyId: string,
  hasChallenge: boolean,
): JourneyState {
  const saved = places.get(placeKey(childId, storyId));
  // A request that was running when the child left is not running any more.
  return saved ? { ...saved, hasChallenge, completing: false } : startJourney(hasChallenge);
}

export function saveJourney(childId: string, storyId: string, state: JourneyState) {
  places.set(placeKey(childId, storyId), state);
}

/** Forgets every saved place (tests). */
export function forgetJourneys() {
  places.clear();
}
