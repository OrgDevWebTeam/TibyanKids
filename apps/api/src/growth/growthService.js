// Keeps the Growth Map up to date (FR-GRW-001, FR-GRW-002): records evidence and re-derives the
// growth state it belongs to. The rules are in growthRules.js.
//
// Every function takes an optional database session. With one, the evidence and the state are
// saved in the caller's transaction. Without one, they are saved one after the other, which is
// safe because the same source can never be counted twice (unique index on EvidenceEvent).
import Competency from "../Models/Competency.js";
import Content from "../Models/Content.js";
import EvidenceEvent from "../Models/EvidenceEvent.js";
import GrowthState from "../Models/GrowthState.js";
import {
  GROWTH_RULES,
  chooseNextGoal,
  deriveCompetencyState,
  resultForActivityScore,
  resultForAssessmentLevel,
} from "./growthRules.js";
import MissionAssignment from "../Models/MissionAssignment.js";
import { OBSERVATION_RESULT } from "../missions/familyLoopRules.js";

const inSession = (query, session) => (session ? query.session(session) : query);

// After a state changed, every state of the child in that domain gets the domain's next goal
async function refreshNextGoals(childId, domain, session) {
  const competencies = await inSession(
    Competency.find({ domain, active: true }).select("code").lean(),
    session,
  );
  const states = await inSession(GrowthState.find({ childId, domain }), session);

  const byId = new Map(states.map((s) => [String(s.competencyId), s]));
  const goal = chooseNextGoal(competencies, byId);

  for (const state of states) {
    const current = state.nextGoal ? String(state.nextGoal) : null;
    const wanted = goal ? String(goal) : null;
    if (current !== wanted) {
      state.nextGoal = goal;
      await state.save({ session });
    }
  }
}

/** Derives the state of one competency from all its evidence, and saves it. */
async function refreshGrowthState(evidence, session) {
  const { childId, familyId, competencyId, domain } = evidence;

  const events = await inSession(EvidenceEvent.find({ childId, competencyId }).lean(), session);
  const derived = deriveCompetencyState(events);

  let state = await inSession(GrowthState.findOne({ childId, competencyId }), session);
  if (state) {
    state.set(derived);
  } else {
    state = new GrowthState({ familyId, childId, competencyId, ...derived });
  }
  await state.save({ session });

  await refreshNextGoals(childId, domain, session);
  return inSession(GrowthState.findById(state._id), session);
}

/**
 * Saves one piece of evidence and updates the growth state. Returns { evidence, state }, or null
 * when this source was already counted for this competency.
 * input: familyId, childId, competencyId, sourceType, sourceId, weight, result, occurredAt.
 */
export async function recordEvidence(input, { session } = {}) {
  let evidence;
  try {
    [evidence] = await EvidenceEvent.create([input], { session });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
  const state = await refreshGrowthState(evidence, session);
  return { evidence, state };
}

/** A completed activity (Progress) is evidence for every active competency of its content. */
export async function recordProgressEvidence(progress, { session } = {}) {
  const content = await inSession(
    Content.findById(progress.contentId).select("competencies"),
    session,
  );
  if (!content || content.competencies.length === 0) return;

  const competencies = await inSession(
    Competency.find({ _id: { $in: content.competencies }, active: true })
      .select("_id")
      .lean(),
    session,
  );

  for (const competency of competencies) {
    await recordEvidence(
      {
        familyId: progress.familyId,
        childId: progress.childId,
        competencyId: competency._id,
        sourceType: "activity",
        sourceId: progress._id,
        weight: GROWTH_RULES.SOURCE_WEIGHT.activity,
        result: resultForActivityScore(progress.score),
        occurredAt: progress.completedAt ?? new Date(),
      },
      { session },
    );
  }
}

/** A completed assessment is evidence for every active competency of its domain. */
export async function recordAssessmentEvidence(assessment, { session } = {}) {
  const competencies = await inSession(
    Competency.find({ domain: assessment.domain, active: true }).select("_id").lean(),
    session,
  );

  for (const competency of competencies) {
    await recordEvidence(
      {
        familyId: assessment.familyId,
        childId: assessment.childId,
        competencyId: competency._id,
        sourceType: "assessment",
        sourceId: assessment._id,
        weight: GROWTH_RULES.SOURCE_WEIGHT.assessment,
        result: resultForAssessmentLevel(assessment.level),
        occurredAt: assessment.completedAt ?? new Date(),
      },
      { session },
    );
  }
}

/**
 * A parent's observation of a home mission is evidence for every active competency of that mission
 * (FR-FAM-002, FR-FAM-004, FR-GRW-001). "Not observed" is no evidence at all. Returns the evidence that was
 * recorded, as a list of { evidence, state }.
 */
export async function recordObservationEvidence(observation, { session } = {}) {
  if (!Object.hasOwn(OBSERVATION_RESULT, observation.status)) return [];

  const assignment = await inSession(
    MissionAssignment.findById(observation.assignmentId).select("missionId"),
    session,
  );
  if (!assignment) return [];

  const mission = await inSession(
    Content.findById(assignment.missionId).select("competencies"),
    session,
  );
  if (!mission || mission.competencies.length === 0) return [];

  const competencies = await inSession(
    Competency.find({ _id: { $in: mission.competencies }, active: true })
      .select("_id")
      .lean(),
    session,
  );

  const recorded = [];
  for (const competency of competencies) {
    const saved = await recordEvidence(
      {
        familyId: observation.familyId,
        childId: observation.childId,
        competencyId: competency._id,
        sourceType: "observation",
        sourceId: observation._id,
        weight: GROWTH_RULES.SOURCE_WEIGHT.observation,
        result: OBSERVATION_RESULT[observation.status],
        occurredAt: observation.createdAt ?? new Date(),
      },
      { session },
    );
    if (saved) recorded.push(saved);
  }
  return recorded;
}
