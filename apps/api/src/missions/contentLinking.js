// Rules for linking a story to a family mission (FR-STORY-001, FR-FAM-001, API-006).
// Pure functions with no database: easy to read and to test. Every number is in LINK_RULES.
// The CRS gives no numbers, so these are the project's chosen starting rules.

export const LINK_RULES = Object.freeze({
  // A package needs at least this many learning outcomes (FR-STORY-001 inputs)
  MIN_OUTCOMES: 1,

  // The story and its mission must train at least this many of the same competencies (FR-FAM-001)
  MIN_SHARED_COMPETENCIES: 1,
});

// Ids can be ObjectIds (from the database) or text (from a request): compare them as text
const sameId = (a, b) => String(a) === String(b);

/** The competencies that both the story and the mission train. */
export function sharedCompetencies(story, mission) {
  const missionIds = mission?.competencies ?? [];
  return (story?.competencies ?? []).filter((id) => missionIds.some((other) => sameId(other, id)));
}

/**
 * The reasons a story cannot be linked to a mission, as a list of sentences. An empty list means the
 * package may be published (FR-STORY-001: "cannot publish without the required mappings and
 * approvals"). A published mission has already been approved by a reviewer, so "published" covers
 * the approval.
 *
 * @param {object} input
 * @param {object|null} input.story    The story content: type, status, ageBand, language, competencies
 * @param {object|null} input.mission  The mission content, with the same fields
 * @param {string[]} [input.outcomes]  The learning outcomes written for the package
 * @returns {string[]}
 */
export function packageProblems({ story, mission, outcomes = [] }) {
  const problems = [];

  if (!story) problems.push("The story was not found");
  else {
    if (story.type !== "story") problems.push("The story must be content of type story");
    if (story.status !== "published") problems.push("The story must be published");
  }

  if (!mission) problems.push("The mission was not found");
  else {
    if (mission.type !== "mission") problems.push("The mission must be content of type mission");
    if (mission.status !== "published") problems.push("The mission must be published and approved");
  }

  // The comparisons need both items
  if (story && mission) {
    if (story.ageBand !== mission.ageBand) problems.push("They must be for the same age band");
    if (story.language !== mission.language) problems.push("They must be in the same language");
    if (sharedCompetencies(story, mission).length < LINK_RULES.MIN_SHARED_COMPETENCIES) {
      problems.push("They must share at least one competency");
    }
  }

  const written = outcomes.filter((outcome) => typeof outcome === "string" && outcome.trim());
  if (written.length < LINK_RULES.MIN_OUTCOMES) {
    problems.push("Add at least one learning outcome");
  }

  return problems;
}

/**
 * Is this content suitable for this child? Only published content, and only for the child's age band
 * (API-006). The language is not checked: a child may learn Arabic content with another home language.
 */
export function eligibleForChild(content, child) {
  return Boolean(
    content && child && content.status === "published" && content.ageBand === child.ageBand,
  );
}
