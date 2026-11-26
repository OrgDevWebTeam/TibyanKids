import { type ApiResult, apiRequest } from "@/lib/api/client";

// A story's mission package (FR-STORY-001 and FR-STORY-002, API-006). A parent's session asks for
// it for one child, and only gets it when the story suits the child's age. Only the fields the
// journey uses.

/** The growth domain of a story or mission, as the API names it. */
export type StoryDomain = "faith" | "quran" | "arabic" | "character" | "future_skills";

export type StoryMission = {
  title: string;
  description: string;
  estimatedMinutes?: number;
  domain?: StoryDomain;
};

/** The decision challenge: a question and two to four options, with no correct answer. */
export type Challenge = { prompt: string; options: string[] };

export type StoryJourney = {
  storyId: string;
  title: string;
  mission: StoryMission;
  challenge?: Challenge;
};

/** The mission the child received for finishing the story: the parent observes it later. */
export type AssignedMission = { assignmentId: string; mission: StoryMission };

type ApiStoryMission = {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  domain?: StoryDomain;
};

type ApiPackage = {
  story: { id: string; title: string };
  mission: ApiStoryMission;
  challenge: { prompt: string; options: { text: string }[] } | null;
};

type ApiCompleted = {
  mission: { assignmentId: string; mission: ApiStoryMission } | null;
};

const toMission = (mission: ApiStoryMission): StoryMission => ({
  title: mission.title,
  description: mission.description ?? "",
  estimatedMinutes: mission.estimatedMinutes,
  domain: mission.domain,
});

/** GET /stories/:id/mission?childId= — 404 when there is none for this child. */
export async function getStoryJourney(
  token: string,
  storyId: string,
  childId: string,
): Promise<ApiResult<StoryJourney>> {
  const query = new URLSearchParams({ childId });
  const result = await apiRequest<ApiPackage>(
    `/api/v1/stories/${encodeURIComponent(storyId)}/mission?${query}`,
    { token },
  );
  if (!result.ok) return result;
  const { story, mission, challenge } = result.data;
  return {
    ok: true,
    data: {
      storyId: story.id,
      title: story.title,
      mission: toMission(mission),
      challenge: challenge
        ? { prompt: challenge.prompt, options: challenge.options.map((option) => option.text) }
        : undefined,
    },
  };
}

/**
 * POST /children/:id/stories/:storyId/complete — records that the child finished the story and
 * answers with the mission it gave, if any. Repeating it changes nothing.
 */
export async function completeStory(
  token: string,
  childId: string,
  storyId: string,
): Promise<ApiResult<AssignedMission | undefined>> {
  const result = await apiRequest<ApiCompleted>(
    `/api/v1/children/${encodeURIComponent(childId)}/stories/${encodeURIComponent(storyId)}/complete`,
    { method: "POST", token },
  );
  if (!result.ok) return result;
  const given = result.data.mission;
  return {
    ok: true,
    data: given
      ? { assignmentId: given.assignmentId, mission: toMission(given.mission) }
      : undefined,
  };
}
