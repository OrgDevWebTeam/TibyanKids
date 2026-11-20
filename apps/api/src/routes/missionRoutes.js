import { Router } from "express";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import loadFamily from "../middlewares/loadFamily.js";
import validate from "../middlewares/validate.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";
import {
  listFamilyMissions,
  observeMissionById,
  reflectMissionById,
} from "../controllers/missionController.js";
import { observeMissionSchema, reflectMissionSchema } from "../validations/missionValidation.js";

// Family missions as the CRS lists them (API-005). The same actions are also available under the
// child: /children/:id/missions (see childrenRoutes.js).
const router = Router();
router.use(apiLimiter);

router.use(authenticate, authorize("parent"), loadFamily);

// ?childId=... is required: whose missions
router.get("/", listFamilyMissions);
router.post("/:assignmentId/observe", validate(observeMissionSchema), observeMissionById);
router.post("/:assignmentId/reflect", validate(reflectMissionSchema), reflectMissionById);

export default router;
