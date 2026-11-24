import { Router } from "express";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import loadFamily from "../middlewares/loadFamily.js";
import validate from "../middlewares/validate.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import {
  getStoryMission,
  publishStoryMission,
  saveStoryMission,
} from "../controllers/storyController.js";
import { savePackageSchema } from "../validations/storyValidation.js";

// Story mission packages (FR-STORY-001, API-006): /stories/:id/mission
const router = Router();
router.use(apiLimiter);
router.use(authenticate);

const contentAdmins = authorize("content_admin", "platform_admin");
const readers = authorize("parent", "content_admin", "reviewer", "platform_admin");

// Only a parent has a family to load. The content team reads the package without one.
const familyForParents = (req, res, next) =>
  req.user.role === "parent" ? loadFamily(req, res, next) : next();

router.get("/:id/mission", readers, familyForParents, getStoryMission);
router.put("/:id/mission", contentAdmins, validate(savePackageSchema), saveStoryMission);
router.patch("/:id/mission/publish", contentAdmins, publishStoryMission);

export default router;
