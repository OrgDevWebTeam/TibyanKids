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
import { apiLimiter } from "../middlewares/rateLimiter.js";
import audioUpload from "../middlewares/audioUpload.js";
import { createRecitationAttempt } from "../controllers/recitationController.js";

const router = Router();
router.use(apiLimiter);

router.use(authenticate, authorize("parent"), loadFamily);

router.post("/", requireVerifiedEmail, validate(createChildSchema), createChild);
router.get("/", listChildren);
router.get("/:id", getChild);
router.patch("/:id", validate(updateChildSchema), updateChild);
router.patch("/:id/archive", archiveChild);
// One recorded ayah (multipart: audio, clientAttemptId, surah, ayah, level)
router.post("/:id/recitation-attempts", audioUpload, createRecitationAttempt);

export default router;
