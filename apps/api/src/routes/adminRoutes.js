import { Router } from "express";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import { listAuditEvents, exportAuditEvents } from "../controllers/adminController.js";
import { apiLimiter } from "../middlewares/rateLimiter.js";

const router = Router();
router.use(apiLimiter);

// Platform admin only (authorization matrix: AuditEvent). A refused request is audited by authorize.
router.use(authenticate, authorize("platform_admin"));

// Read-only: there is no route that creates, changes or deletes an audit event.
router.get("/audit-events", listAuditEvents);
router.get("/audit-events/export", exportAuditEvents);

export default router;
