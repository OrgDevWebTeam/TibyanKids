import { afterEach, describe, expect, it } from "vitest";
import {
  forgetJourneys,
  journeyReducer,
  type JourneyAction,
  saveJourney,
  savedJourney,
  startJourney,
  stepState,
} from "./journey-state";
import { type AssignedMission } from "./story-api";

const MISSION: AssignedMission = {
  assignmentId: "a1",
  mission: { title: "Find three things at home", description: "" },
};

const run = (actions: JourneyAction[], hasChallenge = true) =>
  actions.reduce(journeyReducer, startJourney(hasChallenge));

afterEach(() => forgetJourneys());

describe("journeyReducer", () => {
  it("starts on the story", () => {
    expect(startJourney(true)).toMatchObject({ screen: "story", completing: false });
  });

  it("waits for a choice before leaving the decision", () => {
    const atDecision = run([{ type: "next" }]);
    expect(atDecision.screen).toBe("decision");
    expect(journeyReducer(atDecision, { type: "next" }).screen).toBe("decision");

    const chosen = journeyReducer(atDecision, { type: "choose", choice: 1 });
    expect(chosen.choice).toBe(1);
    expect(journeyReducer(chosen, { type: "next" }).screen).toBe("activity");
  });

  it("moves past a story without a decision challenge", () => {
    expect(run([{ type: "next" }, { type: "next" }], false).screen).toBe("activity");
  });

  it("ignores a choice outside the decision", () => {
    expect(run([{ type: "choose", choice: 0 }]).choice).toBeUndefined();
  });

  it("records the story only from the activity", () => {
    expect(run([{ type: "complete-started" }])).toEqual(startJourney(true));
  });

  it("opens the mission only once the story is recorded", () => {
    const atActivity = run([{ type: "next" }, { type: "choose", choice: 0 }, { type: "next" }]);
    expect(journeyReducer(atActivity, { type: "next" }).screen).toBe("activity");

    const saving = journeyReducer(atActivity, { type: "complete-started" });
    expect(saving.completing).toBe(true);

    const done = journeyReducer(saving, { type: "complete-succeeded", mission: MISSION });
    expect(done).toMatchObject({ screen: "mission", mission: MISSION, completing: false });
  });

  it("stays on the activity when recording fails, ready to try again", () => {
    const atActivity = run([{ type: "next" }, { type: "choose", choice: 0 }, { type: "next" }]);
    const started = journeyReducer(atActivity, { type: "complete-started" });
    const state = journeyReducer(started, { type: "complete-failed" });
    expect(state).toMatchObject({ screen: "activity", completing: false, completeFailed: true });
    expect(journeyReducer(state, { type: "complete-started" }).completeFailed).toBe(false);
  });

  it("ends on lesson complete after the mission", () => {
    const atMission = journeyReducer(
      run([{ type: "next" }, { type: "choose", choice: 0 }, { type: "next" }]),
      { type: "complete-succeeded", mission: MISSION },
    );
    const complete = journeyReducer(atMission, { type: "next" });
    expect(complete.screen).toBe("complete");
    expect(journeyReducer(complete, { type: "next" }).screen).toBe("complete");
  });
});

describe("stepState", () => {
  it("marks the steps before the current one as done", () => {
    expect(stepState("story", "activity")).toBe("done");
    expect(stepState("activity", "activity")).toBe("current");
    expect(stepState("mission", "activity")).toBe("next");
  });

  it("marks every step done on lesson complete", () => {
    expect(stepState("mission", "complete")).toBe("done");
  });
});

describe("saved journeys", () => {
  it("resumes the same child's story where it stopped", () => {
    const atDecision = run([{ type: "next" }, { type: "choose", choice: 1 }]);
    saveJourney("child-1", "story-1", atDecision);

    expect(savedJourney("child-1", "story-1", true)).toMatchObject({
      screen: "decision",
      choice: 1,
    });
    expect(savedJourney("child-2", "story-1", true).screen).toBe("story");
    expect(savedJourney("child-1", "story-2", true).screen).toBe("story");
  });

  it("never resumes a request that was still running", () => {
    saveJourney("child-1", "story-1", { ...startJourney(true), completing: true });
    expect(savedJourney("child-1", "story-1", true).completing).toBe(false);
  });
});
