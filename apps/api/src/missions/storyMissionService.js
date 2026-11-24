// Story mission packages (FR-STORY-001, API-006): a Content Admin links a story to its family mission,
// publishes the package once it is complete, and a child gets the mission of a story they may see.
// The rules for "complete" are in contentLinking.js. This file is the only place that touches the
// database for them.
import AppError from "../utils/AppError.js";
import { recordAudit } from "../utils/audit.js";
import { inTransaction } from "../utils/inTransaction.js";
import Content from "../Models/Content.js";
import StoryMission from "../Models/StoryMission.js";
import { eligibleForChild, packageProblems } from "./contentLinking.js";
import MissionAssignment from "../Models/MissionAssignment.js";
import Progress from "../Models/Progress.js";
import ConsentRecord from "../Models/ConsentRecord.js";

// A request value is turned into text, and compared as a value only (never as an operator)
const byId = (id) => ({ _id: { $eq: String(id) } });
const byStory = (storyId) => ({ storyId: { $eq: String(storyId) } });

// The audit log records a package as a "StoryMission", next to the other content events
const auditTarget = (pkg) => ({ type: "StoryMission", id: pkg._id });

/** The story, or a 404. A story that is still a draft is fine: the package is prepared meanwhile. */
async function findStory(storyId) {
  const story = await Content.findOne({ ...byId(storyId), type: "story" }).lean();
  if (!story) throw new AppError(404, "Story not found");
  return story;
}

/**
 * Creates the package of a story as a draft, or replaces the content of its draft. `data` is the
 * validated body: { missionId, outcomes, vocabulary, challenge }. Returns { package, created }.
 */
export async function saveDraftPackage({ storyId, user, data }) {
  await findStory(storyId);

  try {
    return await inTransaction(async (session) => {
      const existing = await StoryMission.findOne(byStory(storyId)).session(session);

      if (existing) {
        if (existing.status !== "draft") {
          throw new AppError(409, "Only a draft package can be edited");
        }
        existing.set({
          missionId: data.missionId,
          outcomes: data.outcomes,
          vocabulary: data.vocabulary,
        });
        existing.set("challenge.prompt", data.challenge?.prompt);
        existing.set("challenge.options", data.challenge?.options ?? []);
        await existing.save({ session });
        await recordAudit({
          actor: user,
          action: "content.updated",
          target: auditTarget(existing),
          session,
        });
        return { package: existing, created: false };
      }

      const [created] = await StoryMission.create([{ ...data, storyId, createdBy: user._id }], {
        session,
      });
      await recordAudit({
        actor: user,
        action: "content.created",
        target: auditTarget(created),
        session,
      });
      return { package: created, created: true };
    });
  } catch (error) {
    // Two requests created the package at the same moment: the other one won
    if (error.code === 11000) throw new AppError(409, "This story already has a package");
    throw error;
  }
}

/**
 * Publishes the package of a story, but only if packageProblems finds nothing wrong (FR-STORY-001:
 * "cannot publish without the required mappings and approvals"). The package and its audit event are
 * saved together. Returns { published: true, package }, or { published: false, problems } with the
 * reasons, so the admin can fix them all in one go.
 */
export async function publishPackage({ storyId, user }) {
  return inTransaction(async (session) => {
    const pkg = await StoryMission.findOne(byStory(storyId)).session(session);
    if (!pkg) throw new AppError(404, "This story has no package");
    if (pkg.status === "published") throw new AppError(409, "This package is already published");
    if (pkg.status === "archived")
      throw new AppError(409, "An archived package cannot be published");

    const [story, mission] = await Promise.all([
      Content.findOne(byId(pkg.storyId)).session(session).lean(),
      Content.findOne(byId(pkg.missionId)).session(session).lean(),
    ]);

    const problems = packageProblems({ story, mission, outcomes: pkg.outcomes });
    if (problems.length > 0) return { published: false, problems };

    pkg.status = "published";
    pkg.publishedBy = user._id;
    await pkg.save({ session });
    await recordAudit({
      actor: user,
      action: "content.published",
      target: auditTarget(pkg),
      session,
    });
    return { published: true, package: pkg };
  });
}

/** The package of a story in any status, for the content team. */
export async function getPackage(storyId) {
  const pkg = await StoryMission.findOne(byStory(storyId)).lean();
  if (!pkg) throw new AppError(404, "This story has no package");
  return pkg;
}

/**
 * What a child may see of a story's mission (API-006). Returns null (so the caller answers 404)
 * unless the package is published and both the story and the mission are published and suitable
 * for the child's age band. `child` is a child the caller has already shown to be in their family.
 */
export async function missionForStory({ storyId, child }) {
  const pkg = await StoryMission.findOne({ ...byStory(storyId), status: "published" }).lean();
  if (!pkg) return null;

  const [story, mission] = await Promise.all([
    Content.findOne(byId(pkg.storyId)).lean(),
    Content.findOne(byId(pkg.missionId)).lean(),
  ]);
  if (!eligibleForChild(story, child) || !eligibleForChild(mission, child)) return null;

  return {
    story: { id: story._id, title: story.title },
    mission: {
      id: mission._id,
      title: mission.title,
      description: mission.description,
      estimatedMinutes: mission.estimatedMinutes,
      domain: mission.domain,
      level: mission.level,
    },
    outcomes: pkg.outcomes,
    vocabulary: pkg.vocabulary,
    // The question and the choices only: there is no correct answer to leak
    challenge: pkg.challenge?.prompt
      ? { prompt: pkg.challenge.prompt, options: pkg.challenge.options }
      : null,
  };
}

/**
 * A child finishes a story (FR-STORY-002: read the story and receive a real-life mission in one
 * journey). The completed story is saved as the child's progress, with no score: only taking part is
 * proven, so a client can never inflate the Growth Map. The existing hook on Progress then records
 * the evidence and gives the child a mission (the story's own, if its package is published).
 *
 * `child` is a child the caller has already shown to be in their family. Completing the same story
 * again changes nothing and returns the first result. Returns { progress, created, mission }, where
 * mission is the mission that came with it, or null.
 */
export async function completeStory({ child, storyId }) {
  const story = await Content.findOne({ ...byId(storyId), type: "story" }).lean();
  // The same answer for a story that does not exist and one that is not for this child
  if (!eligibleForChild(story, child)) throw new AppError(404, "Story not found");

  // Like a recording, learning data about a child needs active consent
  if (child.status !== "active" || !(await ConsentRecord.hasActiveConsent(child._id))) {
    throw new AppError(403, "Active consent is required");
  }

  const find = () => Progress.findOne({ childId: child._id, contentId: story._id });
  let progress = await find();
  let created = false;

  if (!progress) {
    try {
      progress = await Progress.create({
        familyId: child.familyId,
        childId: child._id,
        contentId: story._id,
        status: "completed",
      });
      created = true;
    } catch (error) {
      // Two requests completed the story at the same moment: the first one was saved
      if (error.code !== 11000) throw error;
      progress = await find();
    }
  } else if (progress.status !== "completed") {
    progress.status = "completed";
    await progress.save();
    created = true;
  }

  return { progress, created, mission: await missionOfProgress(child, progress) };
}

// The mission that completing this progress gave the child, or null
async function missionOfProgress(child, progress) {
  const assignment = await MissionAssignment.findOne({
    childId: child._id,
    sourceProgressId: progress._id,
  }).lean();
  if (!assignment) return null;

  const mission = await Content.findById(assignment.missionId)
    .select("title description estimatedMinutes domain level")
    .lean();
  if (!mission) return null;

  return {
    assignmentId: assignment._id,
    expiresAt: assignment.expiresAt,
    reasonRule: assignment.reasonRule ?? null,
    mission: {
      id: mission._id,
      title: mission.title,
      description: mission.description,
      estimatedMinutes: mission.estimatedMinutes,
      domain: mission.domain,
      level: mission.level,
    },
  };
}
