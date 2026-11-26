import { z } from "zod";
import { USER_NAME_MAX_LENGTH } from "../constants/index.js";
import { countryCode, text } from "./helpers.js";

export const registerSchema = z.object({
  name: text("Name")
    .trim()
    .min(1, "Name is required")
    .max(USER_NAME_MAX_LENGTH, `Name must be at most ${USER_NAME_MAX_LENGTH} characters`),
  email: text("Email")
    .trim()
    .toLowerCase()
    .email("Email is not valid")
    .max(254, "Email is too long"),
  password: text("Password")
    .min(6, "Password must be at least 6 characters")
    .max(72, "Password must be at most 72 characters")
    // \p{Lu} is a capital letter in any alphabet. A special character is anything that is not a
    // letter, an accent mark, a number or a space.
    .regex(/\p{Lu}/u, "Password must contain at least one capital letter")
    .regex(/[^\p{L}\p{M}\p{N}\s]/u, "Password must contain at least one special character"),
  country: countryCode("Country").optional(),
  policyVersion: text("Policy version")
    .trim()
    .min(1, "You must accept the policies")
    .max(50, "Policy version is too long"),
});

export const loginSchema = z.object({
  email: text("Email").trim().toLowerCase().email("Email is not valid"),
  password: text("Password").min(1, "Password is required").max(72),
});

export const verifyEmailSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid verification link"),
  })
  .strict();
