import { z } from "zod";
import { RECITATION_LEVELS } from "@tibyan/contracts";
import { oneOf, text } from "./helpers.js";

// The 25 prototype ayat (CRS v3.0, FR-QUR-009): surah -> number of ayat.
// Must match packages/contracts/data/reference_quran_text.json (tests/quran/recitation.test.js).
export const PROTOTYPE_AYAT = Object.freeze({ 1: 7, 108: 3, 112: 4, 113: 5, 114: 6 });

export function isPrototypeAyah(surah, ayah) {
  return ayah >= 1 && ayah <= (PROTOTYPE_AYAT[surah] ?? 0);
}

// Multipart form fields arrive as text, so the numbers are converted first
const number = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(1, `${label} must be 1 or more`);

export const recitationAttemptSchema = z
  .object({
    // Made by the app for each recording, so a repeated upload is the same attempt (VAL-010)
    clientAttemptId: text("clientAttemptId")
      .trim()
      .min(1, "clientAttemptId is required")
      .max(64, "clientAttemptId is too long"),
    surah: number("surah"),
    ayah: number("ayah"),
    // Until the session engine decides it, the app sends the level (decides what stops the child)
    level: oneOf("level", RECITATION_LEVELS),
  })
  .refine((fields) => isPrototypeAyah(fields.surah, fields.ayah), {
    message: "Not one of the prototype ayat",
    path: ["ayah"],
  });
