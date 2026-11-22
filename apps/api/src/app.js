import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import config from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import childrenRoutes from "./routes/childrenRoutes.js";
import missionRoutes from "./routes/missionRoutes.js";
import AppError from "./utils/AppError.js";
import consentRoutes from "./routes/consentRoutes.js";
import curriculumRoutes from "./routes/curriculumRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { createAiClient } from "./ai/aiClient.js";

const app = express();

// How many proxies are in front of the API (TRUST_PROXY, 0 = none). It decides which address
// the rate limits see: with a load balancer in front and this left at 0, every client would
// share the balancer's address.
app.set("trust proxy", config.trustProxy);

// The internal AI service. Tests replace it with a fake (app.locals.aiClient = ...)
app.locals.aiClient = createAiClient({
  baseUrl: config.aiServiceUrl,
  timeoutMs: config.aiTimeoutMs,
});

// security
app.use(helmet());
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok" });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/children", childrenRoutes);
app.use("/api/v1/missions", missionRoutes);
app.use("/api/v1/consents", consentRoutes);
app.use("/api/v1/curriculum", curriculumRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error Handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.statusCode < 500 ? "fail" : "error",
      message: err.message,
    });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ status: "fail", message: "Invalid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ status: "fail", message: "Request body is too large" });
  }
  if (err.name === "ZodError") {
    return res.status(400).json({
      status: "fail",
      message: "Invalid input",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ status: "fail", message: err.message });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ status: "fail", message: "Invalid id or value" });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "value";
    return res.status(409).json({ status: "fail", message: `${field} already exists` });
  }

  // Only the stack (name, message, code locations): the whole error object can carry values from
  // the request or the database, such as a child's data (SEC-003, gate 11)
  console.error("Unhandled error:", err?.stack ?? String(err));
  res.status(500).json({ status: "error", message: "Server error" });
});

export default app;
