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
import { authLimiter, loginLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), registerParent);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.post("/verify-email", authLimiter, validate(verifyEmailSchema), verifyEmail);
router.post("/resend-verification", authLimiter, authenticate, resendVerification);

export default router;
