import rateLimit from "express-rate-limit";
import config from "../config/env.js";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.apiRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many requests, please try again later" },
});

// Register, verify and resend (SEC-008): every request counts, per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many requests, please try again later" },
});

// Login: only failed attempts count, so correct logins from a shared network do not block others
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many failed logins, please try again later" },
});

// Recitation uploads (SEC-008). Each one is up to 5 MB held in memory and starts an AI analysis of
// up to 20 seconds, so it gets a limit of its own on top of the general one. It is counted per
// signed-in account and not per IP: a family on a shared network does not slow another family
// down, and one account cannot spread its uploads over many addresses. Use it after authenticate.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.uploadRateLimit,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many recordings, please try again later" },
});
