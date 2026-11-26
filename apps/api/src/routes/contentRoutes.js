import { Router } from "express";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import loadFamily from "../middlewares/loadFamily.js";
import validate from "../middlewares/validate.js";
import { createContentSchema, updateContentSchema } from "../validations/contentValidation.js";
import {
  listContent,
  getContent,
  createContent,
  updateContent,
  submitForReview,
  approveContent,
  publishContent,
  createContentVersion,
  listContentVersions,
} from "../controllers/contentController.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";

const router = Router();
router.use(apiLimiter);

const staff = authorize("content_admin", "platform_admin");
const reviewers = authorize("reviewer", "platform_admin");
const staffAndReviewers = authorize("content_admin", "platform_admin", "reviewer");

router.use(authenticate);

// A parent who asks for what suits one of their children (?childId=) needs their family loaded.
// Everyone else reads content exactly as before.
const familyWhenAskingForAChild = (req, res, next) =>
  req.user.role === "parent" && req.query.childId !== undefined
    ? loadFamily(req, res, next)
    : next();

router.get("/", familyWhenAskingForAChild, listContent);
router.get("/:id/versions", staffAndReviewers, listContentVersions);
router.get("/:id", familyWhenAskingForAChild, getContent);

router.post("/", staff, validate(createContentSchema), createContent);
router.patch("/:id", staff, validate(updateContentSchema), updateContent);
router.patch("/:id/submit-review", staff, submitForReview);
router.patch("/:id/approve", reviewers, approveContent);
router.patch("/:id/publish", staff, publishContent);
router.post("/:id/new-version", staff, createContentVersion);

export default router;
