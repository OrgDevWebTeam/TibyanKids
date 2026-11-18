// The family loop (FR-FAM-001 to FR-FAM-003): a mission is assigned to a child, a parent observes it,
// the child reflects on it. The rules are in familyLoopRules.js, the choice of mission is in
// selectMission.js (ADR-0008). This file is the only place that touches the database for it.
import AppError from "../utils/AppError.js";
import Child from "../Models/Child.js";
import { inTransaction } from "../utils/inTransaction.js";
import ChildReflection from "../Models/ChildReflection.js";
import Competency from "../Models/Competency.js";
import Content from "../Models/Content.js";
import GrowthState from "../Models/GrowthState.js";
import MissionAssignment from "../Models/MissionAssignment.js";
import ParentObservation from "../Models/ParentObservation.js";
import { recordObservationEvidence } from "../growth/growthService.js";
import {
  FAMILY_LOOP_RULES,
  assignmentStatus,
  competencyStatusFromGrowth,
} from "./familyLoopRules.js";
import { selectMission, toMissionInput } from "./selectMission.js";

const RECENT_MISSIONS_LOOKED_AT = 20;

const inSession = (query, session) => (session ? query.session(session) : query);

// The assignment, but only if it belongs to this child in this family
async function findAssignment(child, assignmentId) {
  const assignment = await MissionAssignment.findOne({
    _id: { $eq: assignmentId },
    childId: child._id,
    familyId: child.familyId,
  });
  if (!assignment) throw new AppError(404, "Mission not found");
  return assignment;
}

/**
 * Gives the child a new mission, chosen by selectMission. Returns the assignment, or null when
 * there is nothing to give: too many open missions, no suitable published mission, or this
 * source (a completed lesson) already led to one.
 */
export async function assignMission(child, { sourceProgressId, session } = {}) {
  if (!child.ageBand) return null;

  const open = await inSession(
    MissionAssignment.countDocuments({
      childId: child._id,
      completedAt: null,
      expiresAt: { $gt: new Date() },
    }),
    session,
  );
  if (open >= FAMILY_LOOP_RULES.MAX_PENDING_ASSIGNMENTS) return null;

  const missions = await inSession(
    Content.find({ type: "mission", status: "published", ageBand: child.ageBand }).lean(),
    session,
  );
  if (missions.length === 0) return null;

  // Competency ids to codes, and the child's status for each code
  const competencyIds = [...new Set(missions.flatMap((m) => m.competencies.map(String)))];
  const competencies = await inSession(
    Competency.find({ _id: { $in: competencyIds } })
      .select("code")
      .lean(),
    session,
  );
  const codeById = new Map(competencies.map((c) => [String(c._id), c.code]));

  const states = await inSession(
    GrowthState.find({ childId: child._id, competencyId: { $in: competencyIds } }).lean(),
    session,
  );
  const competencyStatus = {};
  for (const state of states) {
    const code = codeById.get(String(state.competencyId));
    if (code) competencyStatus[code] = competencyStatusFromGrowth(state);
  }

  const recent = await inSession(
    MissionAssignment.find({ childId: child._id })
      .sort({ assignedAt: -1 })
      .limit(RECENT_MISSIONS_LOOKED_AT)
      .select("missionId")
      .lean(),
    session,
  );

  const choice = selectMission({
    ageBand: child.ageBand,
    levels: { quran: child.quranLevel, arabic: child.arabicLevel },
    competencyStatus,
    missions: missions.map((m) => toMissionInput(m, codeById)),
    recentMissionIds: recent.map((r) => String(r.missionId)),
  });
  if (!choice.contentId) return null;

  try {
    const [assignment] = await MissionAssignment.create(
      [
        {
          familyId: child.familyId,
          childId: child._id,
          missionId: choice.contentId,
          sourceProgressId,
          reasonRule: choice.reasonRule,
        },
      ],
      { session },
    );
    return assignment;
  } catch (error) {
    if (error.code === 11000) return null; // this source already led to a mission
    throw error;
  }
}

/**
 * A completed lesson or story can lead to a home mission (FR-FAM-001). Returns the assignment, or
 * null when this progress should not lead to one. It checks first, instead of relying on the unique
 * index, so that a repeat never causes an error inside a caller's transaction.
 */
export async function assignMissionForProgress(progress, { session } = {}) {
  const content = await inSession(Content.findById(progress.contentId).select("type"), session);
  if (!content || !FAMILY_LOOP_RULES.SOURCE_CONTENT_TYPES.includes(content.type)) return null;

  const already = await inSession(
    MissionAssignment.exists({ childId: progress.childId, sourceProgressId: progress._id }),
    session,
  );
  if (already) return null;

  const child = await inSession(Child.findById(progress.childId), session);
  if (!child || child.status !== "active") return null;

  return assignMission(child, { sourceProgressId: progress._id, session });
}

/** The child's missions, newest first, each with its status and what was said about it. */
export async function listMissions(child) {
  const assignments = await MissionAssignment.find({ childId: child._id, familyId: child.familyId })
    .sort({ assignedAt: -1 })
    .limit(50)
    .lean();
  if (assignments.length === 0) return [];

  const ids = assignments.map((a) => a._id);
  const [missions, observations, reflections] = await Promise.all([
    Content.find({ _id: { $in: assignments.map((a) => a.missionId) } })
      .select("title description estimatedMinutes domain level")
      .lean(),
    ParentObservation.find({ assignmentId: { $in: ids } })
      .select("assignmentId status note")
      .lean(),
    ChildReflection.find({ assignmentId: { $in: ids } })
      .select("assignmentId choice")
      .lean(),
  ]);

  const missionById = new Map(missions.map((m) => [String(m._id), m]));
  const observationById = new Map(observations.map((o) => [String(o.assignmentId), o]));
  const reflectionById = new Map(reflections.map((r) => [String(r.assignmentId), r]));

  return assignments.map((a) => {
    const mission = missionById.get(String(a.missionId));
    const observation = observationById.get(String(a._id));
    const reflection = reflectionById.get(String(a._id));
    return {
      id: a._id,
      status: assignmentStatus(a),
      assignedAt: a.assignedAt,
      expiresAt: a.expiresAt,
      completedAt: a.completedAt ?? null,
      reasonRule: a.reasonRule ?? null,
      mission: mission
        ? {
            id: mission._id,
            title: mission.title,
            description: mission.description,
            estimatedMinutes: mission.estimatedMinutes,
            domain: mission.domain,
            level: mission.level,
          }
        : null,
      observation: observation ? { status: observation.status, note: observation.note } : null,
      reflection: reflection ? { choice: reflection.choice } : null,
    };
  });
}

/**
 * A parent says what they saw. In one transaction: the observation is saved, the mission is
 * marked completed and the evidence is recorded (FR-FAM-002). Sending the same
 * clientObservationId again returns the first result instead of saving twice.
 * Returns { observation, evidence, duplicate }.
 */
export async function observeMission({
  child,
  assignmentId,
  userId,
  status,
  note,
  clientObservationId,
}) {
  const assignment = await findAssignment(child, assignmentId);

  const existing = async () => {
    if (!clientObservationId) return null;
    const found = await ParentObservation.findOne({
      familyId: child.familyId,
      clientObservationId: { $eq: clientObservationId },
    });
    if (!found) return null;
    if (!found.assignmentId.equals(assignment._id)) {
      throw new AppError(409, "This clientObservationId was used for another mission");
    }
    return { observation: found, evidence: [], duplicate: true };
  };

  const repeated = await existing();
  if (repeated) return repeated;

  const current = assignmentStatus(assignment);
  if (current === "completed") throw new AppError(409, "This mission was already observed");
  if (current === "expired") throw new AppError(409, "This mission has expired");

  try {
    return await inTransaction(async (session) => {
      const [observation] = await ParentObservation.create(
        [
          {
            familyId: child.familyId,
            childId: child._id,
            assignmentId: assignment._id,
            observedBy: userId,
            status,
            note,
            clientObservationId,
          },
        ],
        { session },
      );

      assignment.completedAt = observation.createdAt;
      await assignment.save({ session });

      const evidence = await recordObservationEvidence(observation, { session });
      return { observation, evidence, duplicate: false };
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Two requests arrived together: the other one won
    const raced = await existing();
    if (raced) return raced;
    throw new AppError(409, "This mission was already observed");
  }
}

/**
 * The child says how the mission felt. One reflection per mission, never evidence. Sending the same
 * choice again returns the first reflection (a safe retry); a different choice is refused.
 * Returns { reflection, duplicate }.
 */
export async function reflectOnMission({ child, assignmentId, choice }) {
  const assignment = await findAssignment(child, assignmentId);

  const existing = async () => {
    const found = await ChildReflection.findOne({ assignmentId: assignment._id });
    if (!found) return null;
    if (found.choice !== choice) {
      throw new AppError(409, "This mission already has a different reflection");
    }
    return { reflection: found, duplicate: true };
  };

  const repeated = await existing();
  if (repeated) return repeated;

  if (assignmentStatus(assignment) === "expired") {
    throw new AppError(409, "This mission has expired");
  }

  try {
    const reflection = await ChildReflection.create({
      familyId: child.familyId,
      childId: child._id,
      assignmentId: assignment._id,
      choice,
    });
    return { reflection, duplicate: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    // Two requests arrived together: the other one won
    const raced = await existing();
    if (raced) return raced;
    throw error;
  }
}
