import { z } from "zod";

import { RECITATION_LEVELS } from "./ai.js";
import type { AiResult } from "./ai.js";

/**
 * Quran evidence event contract (docs/contracts/quran-evidence-integration.md, KAN-37).
 * Mapping rules: docs/ai/quran-growth-graph-mapping.md (KAN-38).
 * Source of truth: schemas/quran_evidence_event.schema.json. quranEvidence.test.ts fails if these drift from it.
 *
 * Everything in this file is a pure function or a constant: no I/O, no clock, no random ids.
 * An event never holds audio, a recording reference, a transcript, phoneme text, free text or a name.
 */

export const QURAN_EVIDENCE_SCHEMA_VERSION = "1.0" as const;

export const QURAN_EVIDENCE_SOURCES = ["ai_result", "teacher_decision"] as const;
export type QuranEvidenceSource = (typeof QURAN_EVIDENCE_SOURCES)[number];

/** Architecture 7.1: an AI Quran result is preliminary, a teacher decision is professional. */
export const QURAN_WEIGHT_CLASSES = ["preliminary", "professional"] as const;
export type QuranWeightClass = (typeof QURAN_WEIGHT_CLASSES)[number];

export const QURAN_EFFECTS = ["supports", "countsAgainst", "diagnosticOnly"] as const;
export type QuranEffectKind = (typeof QURAN_EFFECTS)[number];

/** KAN-28 vocabulary. */
export const QURAN_TEACHER_LABELS = ["correct", "needs_practice", "poor_audio"] as const;
export type QuranTeacherLabel = (typeof QURAN_TEACHER_LABELS)[number];

/** CRS FR-LIVE-004. */
export const QURAN_RESOLUTION_STATES = ["resolved", "needs_follow_up"] as const;
export type QuranResolutionState = (typeof QURAN_RESOLUTION_STATES)[number];

/** `mock` only in MOCK_MODE. Ingestion in production rejects it. `none` (API fallback) never emits an event. */
export const QURAN_EVIDENCE_AI_MODELS = [
  "quran-muaalem",
  "whisper-quran",
  "combined",
  "mock",
] as const;

export const QURAN_AI_EVENT_DECISIONS = ["accepted", "error"] as const;

export const QURAN_MAX_EFFECTS = 32;

export const QURAN_OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/;
export const QURAN_IDEMPOTENCY_KEY_PATTERN =
  /^quran:(ai_result|teacher_decision):[a-f0-9]{24}:[1-9][0-9]*$/;
export const QURAN_COMPETENCY_CODE_PATTERN = /^QUR_[A-Z][A-Z0-9_]*$/;
export const QURAN_MODEL_VERSION_PATTERN = /^[A-Za-z0-9._/-]{1,100}$/;
export const QURAN_OCCURRED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** The Quran competency seed catalog (KAN-38 section 4). The three last ones are not active until their code is approved. */
export const QURAN_COMPETENCY_CODES = [
  "QUR_MEM_AYAH",
  "QUR_PRON_LETTER",
  "QUR_PRON_HARAKA",
  "QUR_TAJ_MADD",
  "QUR_TAJ_QALQALA",
  "QUR_MEM_INSERTION",
  "QUR_PRON_MADD_ASLI",
  "QUR_TAJ_GHUNNA",
] as const;
export type QuranCompetencyCode = (typeof QURAN_COMPETENCY_CODES)[number];

export const QURAN_MEMORIZATION_COMPETENCY: QuranCompetencyCode = "QUR_MEM_AYAH";

/** AI error codes that map to a competency (KAN-38 section 5). */
export const QURAN_EFFECT_ERROR_CODES = [
  "ERR_MEM_OMISSION",
  "ERR_MEM_SUBSTITUTION",
  "ERR_MEM_INSERTION",
  "ERR_PRON_LETTER_SUB",
  "ERR_PRON_HARAKA",
  "ERR_PRON_MADD_ASLI_SHORT",
  "ERR_TAJ_MADD_SHORT",
  "ERR_TAJ_GHONNA_OMIT",
  "ERR_TAJ_QALQALA_OMIT",
] as const;
export type QuranEffectErrorCode = (typeof QURAN_EFFECT_ERROR_CODES)[number];

/** AI error codes with no competency. They always make a result `uncertain`, so they never reach an event. */
export const QURAN_UNMAPPED_ERROR_CODES = ["ERR_TAJ_UNMAPPED", "ERR_TECH_MODELS_DISAGREE"] as const;

export const QURAN_ERROR_COMPETENCY = {
  ERR_MEM_OMISSION: "QUR_MEM_AYAH",
  ERR_MEM_SUBSTITUTION: "QUR_MEM_AYAH",
  ERR_MEM_INSERTION: "QUR_MEM_INSERTION",
  ERR_PRON_LETTER_SUB: "QUR_PRON_LETTER",
  ERR_PRON_HARAKA: "QUR_PRON_HARAKA",
  ERR_PRON_MADD_ASLI_SHORT: "QUR_PRON_MADD_ASLI",
  ERR_TAJ_MADD_SHORT: "QUR_TAJ_MADD",
  ERR_TAJ_GHONNA_OMIT: "QUR_TAJ_GHUNNA",
  ERR_TAJ_QALQALA_OMIT: "QUR_TAJ_QALQALA",
} as const satisfies Record<QuranEffectErrorCode, QuranCompetencyCode>;

const EFFECT_ERROR_CODE_SET: ReadonlySet<string> = new Set(QURAN_EFFECT_ERROR_CODES);

export const isQuranEffectErrorCode = (code: string): code is QuranEffectErrorCode =>
  EFFECT_ERROR_CODE_SET.has(code);

// ---------------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------------

export const quranObjectIdSchema = z.string().regex(QURAN_OBJECT_ID_PATTERN);

/** One effect. Strict. Rule S6 and the error code to competency mapping are checked here. */
export const quranEvidenceEffectObjectSchema = z
  .object({
    competencyId: quranObjectIdSchema,
    competencyCode: z.string().max(40).regex(QURAN_COMPETENCY_CODE_PATTERN),
    effect: z.enum(QURAN_EFFECTS),
    wordIndex: z.number().int().min(1).nullable(),
    errorCode: z.enum(QURAN_EFFECT_ERROR_CODES).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const quranEvidenceEffectSchema = quranEvidenceEffectObjectSchema.superRefine(
  (effect, ctx) => {
    if (effect.effect === "supports") {
      for (const field of ["wordIndex", "errorCode", "confidence"] as const) {
        if (effect[field] !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "supports carries no word, code or confidence",
          });
        }
      }
      return;
    }
    if (effect.wordIndex === null || effect.errorCode === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${effect.effect} needs wordIndex and errorCode`,
      });
      return;
    }
    if (QURAN_ERROR_COMPETENCY[effect.errorCode] !== effect.competencyCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["competencyCode"],
        message: `${effect.errorCode} belongs to ${QURAN_ERROR_COMPETENCY[effect.errorCode]}`,
      });
    }
  },
);

const commonShape = {
  schemaVersion: z.literal(QURAN_EVIDENCE_SCHEMA_VERSION),
  eventId: quranObjectIdSchema,
  idempotencyKey: z.string().regex(QURAN_IDEMPOTENCY_KEY_PATTERN),
  revision: z.number().int().min(1),
  domain: z.literal("quran"),
  familyId: quranObjectIdSchema,
  childId: quranObjectIdSchema,
  attemptId: quranObjectIdSchema,
  contentId: quranObjectIdSchema,
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1),
  level: z.enum(RECITATION_LEVELS),
  occurredAt: z
    .string()
    .regex(QURAN_OCCURRED_AT_PATTERN)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "not a real date" }),
  supersedesEventId: quranObjectIdSchema.nullable(),
  effects: z.array(quranEvidenceEffectSchema).max(QURAN_MAX_EFFECTS),
};

export const quranAiEvidenceEventObjectSchema = z
  .object({
    ...commonShape,
    source: z.literal("ai_result"),
    weightClass: z.literal("preliminary"),
    ai: z
      .object({
        decision: z.enum(QURAN_AI_EVENT_DECISIONS),
        model: z.enum(QURAN_EVIDENCE_AI_MODELS),
        modelVersion: z.string().regex(QURAN_MODEL_VERSION_PATTERN),
      })
      .strict(),
  })
  .strict();

export const quranTeacherEvidenceEventObjectSchema = z
  .object({
    ...commonShape,
    source: z.literal("teacher_decision"),
    weightClass: z.literal("professional"),
    teacher: z
      .object({
        decisionId: quranObjectIdSchema,
        teacherId: quranObjectIdSchema,
        label: z.enum(QURAN_TEACHER_LABELS),
        resolutionState: z.enum(QURAN_RESOLUTION_STATES),
      })
      .strict(),
  })
  .strict();

export const teacherResolutionState = (label: QuranTeacherLabel): QuranResolutionState =>
  label === "correct" ? "resolved" : "needs_follow_up";

/** The strict event. Rules S1 to S11 of docs/contracts/quran-evidence-integration.md. */
export const quranEvidenceEventSchema = z
  .discriminatedUnion("source", [
    quranAiEvidenceEventObjectSchema,
    quranTeacherEvidenceEventObjectSchema,
  ])
  .superRefine((event, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // S8
    if (event.supersedesEventId === event.eventId)
      fail(["supersedesEventId"], "an event cannot supersede itself");

    // S7
    const sourceId = event.source === "ai_result" ? event.attemptId : event.teacher.decisionId;
    const expectedKey = `quran:${event.source}:${sourceId}:${event.revision}`;
    if (event.idempotencyKey !== expectedKey) fail(["idempotencyKey"], `expected ${expectedKey}`);

    // S5: no repeated (competencyCode, effect, wordIndex)
    const seen = new Set<string>();
    event.effects.forEach((effect, index) => {
      const key = `${effect.competencyCode}|${effect.effect}|${effect.wordIndex ?? "-"}`;
      if (seen.has(key)) fail(["effects", index], "repeated effect");
      seen.add(key);
    });

    if (event.source === "ai_result") {
      // S4 and S11
      if (event.effects.length === 0)
        fail(["effects"], "an ai_result event has at least one effect");
      if (event.ai.decision === "error") {
        event.effects.forEach((effect, index) => {
          if (effect.effect === "supports")
            fail(["effects", index], "an error result has no supports");
        });
      }
      return;
    }

    // teacher_decision: S3, S4, S9, S10
    const { label, resolutionState } = event.teacher;
    if (resolutionState !== teacherResolutionState(label)) {
      fail(["teacher", "resolutionState"], `${label} must be ${teacherResolutionState(label)}`);
    }
    if (label === "poor_audio") {
      if (event.effects.length > 0) fail(["effects"], "poor_audio has no effects");
    } else if (event.effects.length === 0) {
      fail(["effects"], `${label} has at least one effect`);
    }
    event.effects.forEach((effect, index) => {
      if (effect.confidence !== null)
        fail(["effects", index, "confidence"], "a teacher effect has no confidence");
      if (label === "correct" && effect.effect !== "supports")
        fail(["effects", index], "correct has only supports");
      if (label === "needs_practice" && effect.effect === "supports") {
        fail(["effects", index], "needs_practice has no supports");
      }
    });
  });

export type QuranEvidenceEffect = z.infer<typeof quranEvidenceEffectSchema>;
export type QuranEvidenceEvent = z.infer<typeof quranEvidenceEventSchema>;

// ---------------------------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------------------------

export type QuranEvidenceErrorCode =
  "COMPETENCY_NOT_SEEDED" | "NEEDS_PRACTICE_WITHOUT_FINDING" | "INVALID_ARGUMENT";

export class QuranEvidenceError extends Error {
  readonly code: QuranEvidenceErrorCode;

  constructor(code: QuranEvidenceErrorCode, message: string) {
    super(message);
    this.name = "QuranEvidenceError";
    this.code = code;
  }
}

/** `quran:{source}:{sourceId}:{revision}`. sourceId is the attemptId (ai_result) or the decisionId (teacher_decision). */
export function quranEvidenceIdempotencyKey(
  source: QuranEvidenceSource,
  sourceId: string,
  revision = 1,
): string {
  if (!QURAN_OBJECT_ID_PATTERN.test(sourceId)) {
    throw new QuranEvidenceError("INVALID_ARGUMENT", "sourceId must be a 24-character ObjectId");
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new QuranEvidenceError("INVALID_ARGUMENT", "revision must be an integer of 1 or more");
  }
  return `quran:${source}:${sourceId}:${revision}`;
}

// ---------------------------------------------------------------------------------------------
// Effect computation (KAN-37 section 6)
// ---------------------------------------------------------------------------------------------

/** A seeded Quran competency, as read from the `Competency` collection. */
export interface QuranCompetencyRef {
  readonly id: string;
  readonly code: string;
  readonly active: boolean;
}

export interface QuranAiEffectsInput {
  /** A result that already passed `aiResultSchema`. */
  readonly result: AiResult;
  /** Every seeded Quran competency. */
  readonly competencies: readonly QuranCompetencyRef[];
  /** Codes of the competencies tagged on the quran_task. */
  readonly taggedCodes: readonly string[];
}

export type QuranAiEffectsOutcome =
  | { readonly emit: true; readonly effects: QuranEvidenceEffect[] }
  | { readonly emit: false; readonly reason: "quality_rejected" | "api_fallback" | "uncertain" };

export interface QuranConfirmedFinding {
  readonly wordIndex: number;
  readonly errorCode: QuranEffectErrorCode;
}

export interface QuranTeacherEffectsInput {
  readonly label: QuranTeacherLabel;
  /** Errors the teacher confirmed. At least one for `needs_practice`. Ignored for the other labels. */
  readonly confirmedFindings: readonly QuranConfirmedFinding[];
  readonly competencies: readonly QuranCompetencyRef[];
  readonly taggedCodes: readonly string[];
}

type CompetencyIndex = ReadonlyMap<string, QuranCompetencyRef>;

const indexCompetencies = (competencies: readonly QuranCompetencyRef[]): CompetencyIndex =>
  new Map(competencies.map((competency) => [competency.code, competency] as const));

function requireSeeded(index: CompetencyIndex, code: string): QuranCompetencyRef {
  const found = index.get(code);
  if (found === undefined) {
    throw new QuranEvidenceError("COMPETENCY_NOT_SEEDED", `Quran competency ${code} is not seeded`);
  }
  return found;
}

function findingEffect(
  index: CompetencyIndex,
  errorCode: QuranEffectErrorCode,
  wordIndex: number,
  confidence: number | null,
): QuranEvidenceEffect {
  const code = QURAN_ERROR_COMPETENCY[errorCode];
  const competency = requireSeeded(index, code);
  return {
    competencyId: competency.id,
    competencyCode: code,
    effect: competency.active ? "countsAgainst" : "diagnosticOnly",
    wordIndex,
    errorCode,
    confidence,
  };
}

const compareFindings = (a: QuranEvidenceEffect, b: QuranEvidenceEffect): number =>
  (a.wordIndex ?? 0) - (b.wordIndex ?? 0) || (a.errorCode ?? "").localeCompare(b.errorCode ?? "");

/** One effect per (competency, effect, word). The first one wins. */
function withoutRepeats(effects: readonly QuranEvidenceEffect[]): QuranEvidenceEffect[] {
  const seen = new Set<string>();
  const kept: QuranEvidenceEffect[] = [];
  for (const effect of effects) {
    const key = `${effect.competencyCode}|${effect.effect}|${effect.wordIndex ?? "-"}`;
    if (!seen.has(key)) {
      seen.add(key);
      kept.push(effect);
    }
  }
  return kept;
}

/**
 * The support set: QUR_MEM_AYAH, plus the tagged competencies the AI can detect today (active ones that have an
 * error code), minus every competency that has a countsAgainst. QUR_MEM_AYAH first, the rest in code order.
 */
function supportEffects(
  index: CompetencyIndex,
  taggedCodes: readonly string[],
  againstCodes: ReadonlySet<string>,
): QuranEvidenceEffect[] {
  const memorization = requireSeeded(index, QURAN_MEMORIZATION_COMPETENCY);
  if (!memorization.active) {
    throw new QuranEvidenceError(
      "COMPETENCY_NOT_SEEDED",
      `Quran competency ${QURAN_MEMORIZATION_COMPETENCY} is not active`,
    );
  }
  const detectable = new Set<string>(
    QURAN_EFFECT_ERROR_CODES.map((code) => QURAN_ERROR_COMPETENCY[code]).filter(
      (code) => index.get(code)?.active === true,
    ),
  );
  const wanted = new Set<string>([QURAN_MEMORIZATION_COMPETENCY]);
  for (const code of taggedCodes) {
    if (detectable.has(code)) wanted.add(code);
  }
  return [...wanted]
    .filter((code) => !againstCodes.has(code))
    .sort((a, b) =>
      a === QURAN_MEMORIZATION_COMPETENCY
        ? -1
        : b === QURAN_MEMORIZATION_COMPETENCY
          ? 1
          : a.localeCompare(b),
    )
    .map((code) => {
      const competency = requireSeeded(index, code);
      return {
        competencyId: competency.id,
        competencyCode: code,
        effect: "supports" as const,
        wordIndex: null,
        errorCode: null,
        confidence: null,
      };
    });
}

const againstCodesOf = (effects: readonly QuranEvidenceEffect[]): Set<string> =>
  new Set(
    effects
      .filter((effect) => effect.effect === "countsAgainst")
      .map((effect) => effect.competencyCode),
  );

/**
 * Effects of a saved AI result (KAN-37 section 6.2). Returns `emit: false` when no event is emitted.
 * Throws QuranEvidenceError `COMPETENCY_NOT_SEEDED` when the catalog is incomplete: an effect is never dropped silently.
 */
export function computeQuranAiEvidenceEffects(input: QuranAiEffectsInput): QuranAiEffectsOutcome {
  const { result } = input;
  if (result.quality !== "ok") return { emit: false, reason: "quality_rejected" };
  if (result.model === "none") return { emit: false, reason: "api_fallback" };
  if (result.decision === "uncertain") return { emit: false, reason: "uncertain" };

  const index = indexCompetencies(input.competencies);
  const findingEffects: QuranEvidenceEffect[] = [];
  for (const finding of result.findings) {
    if (!isQuranEffectErrorCode(finding.code)) continue; // no competency: cannot happen after the checks above
    findingEffects.push(findingEffect(index, finding.code, finding.wordIndex, finding.confidence));
  }
  const findings = withoutRepeats(findingEffects.sort(compareFindings));

  if (result.decision === "error") {
    requireSeeded(index, QURAN_MEMORIZATION_COMPETENCY);
    return { emit: true, effects: findings };
  }
  const supports = supportEffects(index, input.taggedCodes, againstCodesOf(findings));
  return { emit: true, effects: [...findings, ...supports] };
}

/** Effects of a saved teacher decision (KAN-37 section 6.3). */
export function computeQuranTeacherEvidenceEffects(
  input: QuranTeacherEffectsInput,
): QuranEvidenceEffect[] {
  if (input.label === "poor_audio") return [];
  const index = indexCompetencies(input.competencies);

  if (input.label === "correct") return supportEffects(index, input.taggedCodes, new Set());

  if (input.confirmedFindings.length === 0) {
    throw new QuranEvidenceError(
      "NEEDS_PRACTICE_WITHOUT_FINDING",
      "needs_practice needs at least one confirmed finding",
    );
  }
  const effects = input.confirmedFindings.map((finding) => {
    if (
      !Number.isInteger(finding.wordIndex) ||
      finding.wordIndex < 1 ||
      !isQuranEffectErrorCode(finding.errorCode)
    ) {
      throw new QuranEvidenceError(
        "INVALID_ARGUMENT",
        "a confirmed finding needs a wordIndex of 1 or more and an effect error code",
      );
    }
    return findingEffect(index, finding.errorCode, finding.wordIndex, null);
  });
  return withoutRepeats(effects.sort(compareFindings));
}
