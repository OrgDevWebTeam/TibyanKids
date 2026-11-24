import { Router } from "express";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import loadFamily from "../middlewares/loadFamily.js";
import requireVerifiedEmail from "../middlewares/requireVerifiedEmail.js";
import validate from "../middlewares/validate.js";
import { createChildSchema, updateChildSchema } from "../validations/childValidation.js";
import {
  createChild,
  listChildren,
  getChild,
  updateChild,
  archiveChild,
} from "../controllers/childrenController.js";
import { apiLimiter, uploadLimiter } from "../middlewares/rateLimiter.js";
import audioUpload from "../middlewares/audioUpload.js";
import { createRecitationAttempt } from "../controllers/recitationController.js";
import { getGrowth } from "../controllers/growthController.js";
import { recitationAttemptSchema } from "../validations/recitationValidation.js";
import {
  listChildMissions,
  observeChildMission,
  reflectChildMission,
} from "../controllers/missionController.js";
import { observeMissionSchema, reflectMissionSchema } from "../validations/missionValidation.js";
import { completeChildStory } from "../controllers/storyController.js";
import { completeStorySchema } from "../validations/storyValidation.js";

const router = Router();
router.use(apiLimiter);

router.use(authenticate, authorize("parent"), loadFamily);

router.post("/", requireVerifiedEmail, validate(createChildSchema), createChild);
router.get("/", listChildren);
router.get("/:id", getChild);
router.patch("/:id", validate(updateChildSchema), updateChild);
router.patch("/:id/archive", archiveChild);
// The Growth Map of one child (API-004)
router.get("/:id/growth", getGrowth);
// The family loop: missions, a parent's observation, the child's reflection (FR-FAM-001 to FR-FAM-003, API-005)
router.get("/:id/missions", listChildMissions);
router.post(
  "/:id/missions/:assignmentId/observe",
  validate(observeMissionSchema),
  observeChildMission,
);
router.post(
  "/:id/missions/:assignmentId/reflect",
  validate(reflectMissionSchema),
  reflectChildMission,
);
// A child finishes a story and receives its mission (FR-STORY-002)
router.post("/:id/stories/:storyId/complete", validate(completeStorySchema), completeChildStory);
// One recorded ayah (multipart: audio, clientAttemptId, surah, ayah, level)
router.post(
  "/:id/recitation-attempts",
  uploadLimiter,
  audioUpload,
  validate(recitationAttemptSchema),
  createRecitationAttempt,
);

export default router;
