import { invalidInput } from "../middlewares/validate.js";
import {
  completeStory,
  getPackage,
  missionForStory,
  publishPackage,
  saveDraftPackage,
} from "../missions/storyMissionService.js";
import AppError from "../utils/AppError.js";
import { findChildInFamily } from "../utils/findChildInFamily.js";
import { findMyChild } from "../utils/findMyChild.js";
import { storyMissionQuery } from "../validations/storyValidation.js";

// The roles that read a package itself, in any status. A parent only gets the mission, for a child.
const CONTENT_TEAM = ["content_admin", "reviewer", "platform_admin"];

// What the content team sees of a package. Built field by field, so nothing leaves by accident.
const packageView = (pkg) => ({
  id: pkg._id,
  storyId: pkg.storyId,
  missionId: pkg.missionId,
  status: pkg.status,
  outcomes: [...pkg.outcomes],
  vocabulary: pkg.vocabulary.map(({ word, meaning }) => ({ word, meaning })),
  challenge: {
    prompt: pkg.challenge?.prompt ?? null,
    options: (pkg.challenge?.options ?? []).map(({ text }) => ({ text })),
  },
  publishedAt: pkg.publishedAt ?? null,
  createdAt: pkg.createdAt,
  updatedAt: pkg.updatedAt,
});

// FR-STORY-001: create the package of a story as a draft, or replace its draft.
// 201 for a new package, 200 when an existing draft was replaced.
export async function saveStoryMission(req, res) {
  const { package: pkg, created } = await saveDraftPackage({
    storyId: req.params.id,
    user: req.user,
    data: req.body,
  });
  res.status(created ? 201 : 200).json({ status: "success", package: packageView(pkg) });
}

// FR-STORY-001: publish the package. A package that is not complete is answered with 409 and the
// full list of what is missing.
export async function publishStoryMission(req, res) {
  const result = await publishPackage({ storyId: req.params.id, user: req.user });

  if (!result.published) {
    return res.status(409).json({
      status: "fail",
      message: "The package cannot be published yet",
      problems: result.problems,
    });
  }
  res.json({ status: "success", package: packageView(result.package) });
}

// API-006: the content team reads the package. A parent asks for the mission of a story for one of
// their children (?childId=), and only gets it when the child's age band suits it.
export async function getStoryMission(req, res) {
  const query = storyMissionQuery.safeParse(req.query);
  if (!query.success) return invalidInput(res, query.error.issues);

  if (CONTENT_TEAM.includes(req.user.role)) {
    const pkg = await getPackage(req.params.id);
    return res.json({ status: "success", package: packageView(pkg) });
  }

  if (!query.data.childId) {
    return invalidInput(res, [{ path: ["childId"], message: "childId is required" }]);
  }
  const child = await findChildInFamily(req, query.data.childId);

  const result = await missionForStory({ storyId: req.params.id, child });
  // The same answer whether there is no package or it is not for this child
  if (!result) throw new AppError(404, "Mission not found");

  res.json({ status: "success", ...result });
}

// FR-STORY-002: a parent says their child finished a story. 201 the first time, 200 when it was
// already completed. The answer carries the mission that came with it, if any.
export async function completeChildStory(req, res) {
  const child = await findMyChild(req);
  if (!child) throw new AppError(404, "Child not found");

  const { progress, created, mission } = await completeStory({
    child,
    storyId: req.params.storyId,
  });

  res.status(created ? 201 : 200).json({
    status: "success",
    created,
    progress: {
      id: progress._id,
      storyId: progress.contentId,
      status: progress.status,
      completedAt: progress.completedAt,
    },
    mission,
  });
}
