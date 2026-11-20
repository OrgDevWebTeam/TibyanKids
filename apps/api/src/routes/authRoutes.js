import { Router } from "express";
import validate from "../middlewares/validate.js";
import { registerSchema, loginSchema, verifyEmailSchema } from "../validations/authValidation.js";
import {
  registerParent,
  login,
  verifyEmail,
  resendVerification,
} from "../controllers/authController.js";
import authenticate from "../middlewares/authenticate.js";

const router = Router();

router.post("/register", validate(registerSchema), registerParent);
router.post("/login", validate(loginSchema), login);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", authenticate, resendVerification);

export default router;
