import { z } from "zod";
import { databaseUrlProblem } from "./envRules.js";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "staging", "production"]),
    PORT: z.coerce.number().int().positive().default(5000),
    DATABASE: z
      .string()
      .min(1)
      .refine((v) => v.includes("<PASSWORD>"), {
        message: "must contain the <PASSWORD> placeholder",
      }),
    DATABASE_PASSWORD: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default("7d"),
    CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
    // The internal AI service (services/ai). Never exposed to browsers.
    AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
    // After this the ayah is marked uncertain and the session goes on (NFR-PERF: 20 s at most)
    AI_TIMEOUT_MS: z.coerce.number().int().positive().max(20000).default(20000),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    // Recitation uploads per signed-in account per 15 minutes (SEC-008)
    UPLOAD_RATE_LIMIT: z.coerce.number().int().positive().default(60),
    // How many proxies sit in front of the API (0 = none). Needed behind a load balancer, so that
    // each client has its own rate limit instead of all sharing the proxy's address.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  })
  // SEC-003: outside development the database must be reached over TLS and must not be local
  .superRefine((env, ctx) => {
    const problem = databaseUrlProblem(env.NODE_ENV, env.DATABASE);
    if (problem) ctx.addIssue({ code: "custom", path: ["DATABASE"], message: problem });
  });

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  for (const issue of result.error.issues) {
    console.error(` - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = result.data;

const config = Object.freeze({
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  databaseUrl: env.DATABASE.replace("<PASSWORD>", encodeURIComponent(env.DATABASE_PASSWORD)),
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  clientOrigin: env.CLIENT_ORIGIN,
  aiServiceUrl: env.AI_SERVICE_URL,
  aiTimeoutMs: env.AI_TIMEOUT_MS,
  authRateLimit: env.AUTH_RATE_LIMIT,
  uploadRateLimit: env.UPLOAD_RATE_LIMIT,
  trustProxy: env.TRUST_PROXY,
});

export default config;
