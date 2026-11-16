import { describe, expect, it } from "vitest";
import rawSchema from "../schemas/quran_evidence_event.schema.json" with { type: "json" };

import { AI_ERROR_CODES, RECITATION_LEVELS, aiFallbackResult } from "./ai.js";
import type { AiFinding, AiResult } from "./ai.js";
import {
  QURAN_AI_EVENT_DECISIONS,
  QURAN_COMPETENCY_CODES,
  QURAN_COMPETENCY_CODE_PATTERN,
  QURAN_EFFECTS,
  QURAN_EFFECT_ERROR_CODES,
  QURAN_ERROR_COMPETENCY,
  QURAN_EVIDENCE_AI_MODELS,
  QURAN_EVIDENCE_SOURCES,
  QURAN_IDEMPOTENCY_KEY_PATTERN,
  QURAN_MAX_EFFECTS,
  QURAN_MODEL_VERSION_PATTERN,
  QURAN_OBJECT_ID_PATTERN,
  QURAN_OCCURRED_AT_PATTERN,
  QURAN_RESOLUTION_STATES,
  QURAN_TEACHER_LABELS,
  QURAN_UNMAPPED_ERROR_CODES,
  QURAN_WEIGHT_CLASSES,
  QuranEvidenceError,
  computeQuranAiEvidenceEffects,
  computeQuranTeacherEvidenceEffects,
  quranAiEvidenceEventObjectSchema,
  quranEvidenceEffectObjectSchema,
  quranEvidenceEffectSchema,
  quranEvidenceEventSchema,
  quranEvidenceIdempotencyKey,
  quranTeacherEvidenceEventObjectSchema,
  teacherResolutionState,
} from "./quranEvidence.js";
import type {
  QuranAiEffectsOutcome,
  QuranCompetencyRef,
  QuranEvidenceEffect,
} from "./quranEvidence.js";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

type JsonObject = { [key: string]: unknown };

const schema = rawSchema as unknown as JsonObject;
const obj = (value: unknown): JsonObject => value as JsonObject;
const list = (value: unknown): unknown[] => value as unknown[];
const sorted = (values: readonly unknown[]): unknown[] => [...values].sort();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defs = obj(schema["$defs"]);
const rootProps = obj(schema["properties"]);
const effectDef = obj(defs["effect"]);
const effectProps = obj(effectDef["properties"]);
const aiDef = obj(defs["aiBlock"]);
const teacherDef = obj(defs["teacherBlock"]);
const examples = list(schema["examples"]) as JsonObject[];

const enumOf = (node: unknown): unknown[] => list(obj(node)["enum"]);
const parse = (value: unknown) => quranEvidenceEventSchema.safeParse(value);

/** Parse a copy of `base` after `change` edited it. */
function variant(base: JsonObject, change: (event: JsonObject) => void) {
  const copy = clone(base);
  change(copy);
  return parse(copy);
}

const [
  AI_ACCEPTED,
  TEACHER_POOR_AUDIO,
  AI_ERROR,
  TEACHER_CORRECT,
  AI_MADD_NOTE,
  TEACHER_NEEDS_PRACTICE,
  AI_GHUNNA,
] = examples as [
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
];

const ID = {
  family: "6650f0c2a1b2c3d4e5f60a01",
  child: "6650f0c2a1b2c3d4e5f60b01",
  attempt: "6650f0c2a1b2c3d4e5f60d01",
};

/** The seeded catalog of the examples. The last three are not active (their code is not approved). */
const CATALOG: QuranCompetencyRef[] = [
  { id: "6650f0c2a1b2c3d4e5f60e01", code: "QUR_MEM_AYAH", active: true },
  { id: "6650f0c2a1b2c3d4e5f60e02", code: "QUR_PRON_LETTER", active: true },
  { id: "6650f0c2a1b2c3d4e5f60e03", code: "QUR_PRON_HARAKA", active: true },
  { id: "6650f0c2a1b2c3d4e5f60e04", code: "QUR_TAJ_MADD", active: true },
  { id: "6650f0c2a1b2c3d4e5f60e05", code: "QUR_TAJ_QALQALA", active: true },
  { id: "6650f0c2a1b2c3d4e5f60e06", code: "QUR_TAJ_GHUNNA", active: false },
  { id: "6650f0c2a1b2c3d4e5f60e07", code: "QUR_MEM_INSERTION", active: false },
  { id: "6650f0c2a1b2c3d4e5f60e08", code: "QUR_PRON_MADD_ASLI", active: false },
];
const TAGGED = ["QUR_MEM_AYAH", "QUR_TAJ_MADD"];

const CATEGORY: Record<string, AiFinding["category"]> = {
  ERR_MEM: "memorization",
  ERR_PRON: "pronunciation",
  ERR_TAJ: "tajweed",
  ERR_TECH: "technical",
};

function finding(wordIndex: number, code: AiFinding["code"], confidence: number): AiFinding {
  const category = CATEGORY[code.split("_").slice(0, 2).join("_")] as AiFinding["category"];
  return {
    wordIndex,
    category,
    code,
    confidence,
    wordStartMs: 0,
    wordEndMs: 600,
    messageKey: "FEEDBACK_WORD_DIFFERENT",
  };
}

function aiResult(overrides: Partial<AiResult> = {}): AiResult {
  return {
    attemptId: ID.attempt,
    model: "combined",
    modelVersion: "mdd-0.1",
    decision: "accepted",
    quality: "ok",
    findings: [],
    processingMs: 10,
    ...overrides,
  };
}

function aiEffects(
  result: AiResult,
  taggedCodes: readonly string[] = TAGGED,
  catalog = CATALOG,
): QuranEvidenceEffect[] {
  const outcome = computeQuranAiEvidenceEffects({ result, competencies: catalog, taggedCodes });
  if (!outcome.emit) throw new Error(`no event: ${outcome.reason}`);
  return outcome.effects;
}

const summary = (effects: readonly QuranEvidenceEffect[]) =>
  effects.map(
    (e) => `${e.effect}:${e.competencyCode}${e.wordIndex === null ? "" : `@${e.wordIndex}`}`,
  );

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value as object).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function errorCodeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof QuranEvidenceError) return error.code;
    throw error;
  }
  return "no error";
}

// ---------------------------------------------------------------------------------------------
// The JSON Schema and the zod schema describe the same contract
// ---------------------------------------------------------------------------------------------

describe("JSON Schema and zod stay in step", () => {
  const commonKeys = Object.keys(quranAiEvidenceEventObjectSchema.shape).filter(
    (key) => key !== "ai",
  );

  it("has the same event fields", () => {
    expect(sorted(list(schema["required"]))).toEqual(sorted(commonKeys));
    expect(sorted(Object.keys(rootProps as Record<string, unknown>))).toEqual(
      sorted([...commonKeys, "ai", "teacher"]),
    );
    expect(
      Object.keys(quranTeacherEvidenceEventObjectSchema.shape).filter((key) => key !== "teacher"),
    ).toEqual(Object.keys(quranAiEvidenceEventObjectSchema.shape).filter((key) => key !== "ai"));
  });

  it("has the same fields in the effect, ai and teacher blocks", () => {
    expect(sorted(list(effectDef["required"]))).toEqual(
      sorted(Object.keys(quranEvidenceEffectObjectSchema.shape)),
    );
    expect(sorted(Object.keys(effectProps as Record<string, unknown>))).toEqual(
      sorted(Object.keys(quranEvidenceEffectObjectSchema.shape)),
    );
    expect(sorted(list(aiDef["required"]))).toEqual(
      sorted(Object.keys(quranAiEvidenceEventObjectSchema.shape.ai.shape)),
    );
    expect(sorted(list(teacherDef["required"]))).toEqual(
      sorted(Object.keys(quranTeacherEvidenceEventObjectSchema.shape.teacher.shape)),
    );
  });

  it("is strict everywhere", () => {
    for (const node of [schema, effectDef, aiDef, teacherDef])
      expect(node["additionalProperties"]).toBe(false);
  });

  it("has the same enums", () => {
    expect(enumOf(rootProps["source"])).toEqual([...QURAN_EVIDENCE_SOURCES]);
    expect(enumOf(rootProps["weightClass"])).toEqual([...QURAN_WEIGHT_CLASSES]);
    expect(enumOf(rootProps["level"])).toEqual([...RECITATION_LEVELS]);
    expect(enumOf(obj(aiDef["properties"])["decision"])).toEqual([...QURAN_AI_EVENT_DECISIONS]);
    expect(enumOf(obj(aiDef["properties"])["model"])).toEqual([...QURAN_EVIDENCE_AI_MODELS]);
    expect(enumOf(obj(teacherDef["properties"])["label"])).toEqual([...QURAN_TEACHER_LABELS]);
    expect(enumOf(obj(teacherDef["properties"])["resolutionState"])).toEqual([
      ...QURAN_RESOLUTION_STATES,
    ]);
    expect(enumOf(effectProps["effect"])).toEqual([...QURAN_EFFECTS]);
    expect(enumOf(effectProps["errorCode"])).toEqual([...QURAN_EFFECT_ERROR_CODES, null]);
  });

  it("has the same constants, patterns and limits", () => {
    expect(obj(rootProps["schemaVersion"])["const"]).toBe("1.0");
    expect(obj(rootProps["domain"])["const"]).toBe("quran");
    expect(obj(defs["objectId"])["pattern"]).toBe(QURAN_OBJECT_ID_PATTERN.source);
    expect(obj(rootProps["idempotencyKey"])["pattern"]).toBe(QURAN_IDEMPOTENCY_KEY_PATTERN.source);
    expect(obj(rootProps["occurredAt"])["pattern"]).toBe(QURAN_OCCURRED_AT_PATTERN.source);
    expect(obj(effectProps["competencyCode"])["pattern"]).toBe(
      QURAN_COMPETENCY_CODE_PATTERN.source,
    );
    expect(obj(obj(aiDef["properties"])["modelVersion"])["pattern"]).toBe(
      QURAN_MODEL_VERSION_PATTERN.source,
    );
    expect(obj(effectProps["competencyCode"])["maxLength"]).toBe(40);
    expect(obj(rootProps["effects"])["maxItems"]).toBe(QURAN_MAX_EFFECTS);
    expect(obj(rootProps["surah"])["minimum"]).toBe(1);
    expect(obj(rootProps["surah"])["maximum"]).toBe(114);
    expect(obj(rootProps["revision"])["minimum"]).toBe(1);
    expect(obj(rootProps["ayah"])["minimum"]).toBe(1);
  });

  it("maps each error code to the same competency", () => {
    const fromSchema: Record<string, unknown> = {};
    for (const rule of list(effectDef["allOf"]).map(obj)) {
      const errorCodeRule = obj(obj(rule["if"])["properties"])["errorCode"];
      if (errorCodeRule === undefined) continue;
      const code = obj(errorCodeRule)["const"];
      if (typeof code === "string")
        fromSchema[code] = obj(obj(obj(rule["then"])["properties"])["competencyCode"])["const"];
    }
    expect(fromSchema).toEqual({ ...QURAN_ERROR_COMPETENCY });
  });

  it("holds no free text: every string is a pattern, an enum or a constant", () => {
    const loose: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${path}[${i}]`));
      if (node === null || typeof node !== "object") return;
      const record = obj(node);
      if (
        record["type"] === "string" &&
        !("pattern" in record) &&
        !("enum" in record) &&
        !("const" in record)
      ) {
        loose.push(path);
      }
      for (const [key, child] of Object.entries(record)) {
        if (!["examples", "if", "then", "else", "not", "allOf"].includes(key))
          walk(child, `${path}.${key}`);
      }
    };
    walk(schema, "$");
    expect(loose).toEqual([]);
  });

  it("covers every AI error code exactly once", () => {
    expect(sorted([...QURAN_EFFECT_ERROR_CODES, ...QURAN_UNMAPPED_ERROR_CODES])).toEqual(
      sorted(AI_ERROR_CODES),
    );
    for (const code of QURAN_EFFECT_ERROR_CODES) {
      expect(QURAN_COMPETENCY_CODES).toContain(QURAN_ERROR_COMPETENCY[code]);
    }
    expect(new Set(QURAN_COMPETENCY_CODES).size).toBe(QURAN_COMPETENCY_CODES.length);
  });
});

// ---------------------------------------------------------------------------------------------
// The examples of docs/contracts/quran-evidence-integration.md
// ---------------------------------------------------------------------------------------------

describe("documented examples", () => {
  it("has seven and all of them are valid", () => {
    expect(examples).toHaveLength(7);
    for (const example of examples) {
      const result = parse(example);
      expect(result.success).toBe(true);
    }
  });

  it("forms one chain with one head for each attempt", () => {
    const byAttempt = new Map<string, JsonObject[]>();
    for (const example of examples) {
      const key = String(example["attemptId"]);
      byAttempt.set(key, [...(byAttempt.get(key) ?? []), example]);
    }
    for (const chain of byAttempt.values()) {
      const ids = new Set(chain.map((e) => String(obj(e)["eventId"])));
      const superseded = chain
        .map((e) => obj(e)["supersedesEventId"])
        .filter((id) => id !== null)
        .map(String);
      expect(superseded.every((id) => ids.has(id))).toBe(true);
      expect(chain.filter((e) => !superseded.includes(String(obj(e)["eventId"])))).toHaveLength(1);
      expect(chain.filter((e) => obj(e)["supersedesEventId"] === null)).toHaveLength(1);
    }
  });

  it("keeps one family and one child, and never uses the same event id twice", () => {
    expect(new Set(examples.map((e) => e["familyId"])).size).toBe(1);
    expect(new Set(examples.map((e) => e["childId"])).size).toBe(1);
    expect(new Set(examples.map((e) => e["eventId"])).size).toBe(7);
    expect(new Set(examples.map((e) => e["idempotencyKey"])).size).toBe(7);
  });

  it("is reproduced by the effect helpers, field for field", () => {
    const fromAi = (result: AiResult) => aiEffects(result);
    expect(fromAi(aiResult())).toEqual(AI_ACCEPTED["effects"]);
    expect(
      fromAi(aiResult({ decision: "error", findings: [finding(1, "ERR_MEM_SUBSTITUTION", 0.92)] })),
    ).toEqual(AI_ERROR["effects"]);
    expect(fromAi(aiResult({ findings: [finding(1, "ERR_TAJ_MADD_SHORT", 0.86)] }))).toEqual(
      AI_MADD_NOTE["effects"],
    );
    expect(fromAi(aiResult({ findings: [finding(4, "ERR_TAJ_GHONNA_OMIT", 0.9)] }))).toEqual(
      AI_GHUNNA["effects"],
    );

    const teacher = (label: "correct" | "needs_practice" | "poor_audio") =>
      computeQuranTeacherEvidenceEffects({
        label,
        confirmedFindings: [{ wordIndex: 1, errorCode: "ERR_TAJ_MADD_SHORT" }],
        competencies: CATALOG,
        taggedCodes: TAGGED,
      });
    expect(teacher("poor_audio")).toEqual(TEACHER_POOR_AUDIO["effects"]);
    expect(teacher("correct")).toEqual(TEACHER_CORRECT["effects"]);
    expect(teacher("needs_practice")).toEqual(TEACHER_NEEDS_PRACTICE["effects"]);
  });
});

// ---------------------------------------------------------------------------------------------
// The strict event and its rules S1 to S11
// ---------------------------------------------------------------------------------------------

describe("strict event", () => {
  it("rejects every field that could carry audio, text, names or presentation", () => {
    for (const key of [
      "audioRef",
      "audioUrl",
      "transcript",
      "phonemes",
      "notes",
      "comment",
      "childName",
      "messageKey",
      "decision",
    ]) {
      expect(variant(AI_ACCEPTED, (e) => void (e[key] = "x")).success).toBe(false);
    }
    expect(variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["transcript"] = "x")).success).toBe(
      false,
    );
    expect(variant(TEACHER_CORRECT, (e) => void (obj(e["teacher"])["notes"] = "x")).success).toBe(
      false,
    );
    expect(
      variant(AI_ACCEPTED, (e) => void (obj(list(e["effects"])[0])["note"] = "x")).success,
    ).toBe(false);
  });

  it("requires every field", () => {
    for (const key of Object.keys(AI_ACCEPTED)) {
      expect(variant(AI_ACCEPTED, (e) => void delete e[key]).success).toBe(false);
    }
    for (const key of Object.keys(obj(list(AI_ACCEPTED["effects"])[0]))) {
      expect(variant(AI_ACCEPTED, (e) => void delete obj(list(e["effects"])[0])[key]).success).toBe(
        false,
      );
    }
  });

  it("accepts only 24-character lower-case hexadecimal ObjectIds", () => {
    const bad = [
      "6650F0C2A1B2C3D4E5F60A01",
      "6650f0c2a1b2c3d4e5f60a0",
      "6650f0c2a1b2c3d4e5f60a011",
      "6650f0c2a1b2c3d4e5f60g01",
      "",
    ];
    for (const field of ["eventId", "familyId", "childId", "attemptId", "contentId"]) {
      for (const value of bad)
        expect(variant(AI_ACCEPTED, (e) => void (e[field] = value)).success).toBe(false);
    }
    for (const field of ["decisionId", "teacherId"]) {
      for (const value of bad)
        expect(
          variant(TEACHER_CORRECT, (e) => void (obj(e["teacher"])[field] = value)).success,
        ).toBe(false);
    }
    expect(variant(AI_ACCEPTED, (e) => void (e["supersedesEventId"] = "nope")).success).toBe(false);
    expect(
      variant(AI_ACCEPTED, (e) => void (obj(list(e["effects"])[0])["competencyId"] = "nope"))
        .success,
    ).toBe(false);
  });

  it("checks the constants and ranges", () => {
    expect(variant(AI_ACCEPTED, (e) => void (e["schemaVersion"] = "2.0")).success).toBe(false);
    expect(variant(AI_ACCEPTED, (e) => void (e["domain"] = "arabic")).success).toBe(false);
    for (const surah of [0, 115, 1.5])
      expect(variant(AI_ACCEPTED, (e) => void (e["surah"] = surah)).success).toBe(false);
    for (const ayah of [0, -1, 2.5])
      expect(variant(AI_ACCEPTED, (e) => void (e["ayah"] = ayah)).success).toBe(false);
    for (const revision of [0, -1, 1.5])
      expect(variant(AI_ACCEPTED, (e) => void (e["revision"] = revision)).success).toBe(false);
    expect(variant(AI_ACCEPTED, (e) => void (e["level"] = "expert")).success).toBe(false);
    expect(variant(AI_ACCEPTED, (e) => void (e["supersedesEventId"] = null)).success).toBe(true);
  });

  it("accepts a UTC date-time only, and only a real date", () => {
    for (const value of [
      "2026-11-20T09:14:05+01:00",
      "2026-11-20 09:14:05Z",
      "2026-11-20",
      "2026-13-40T00:00:00Z",
      "",
    ]) {
      expect(variant(AI_ACCEPTED, (e) => void (e["occurredAt"] = value)).success).toBe(false);
    }
    expect(
      variant(AI_ACCEPTED, (e) => void (e["occurredAt"] = "2026-11-20T09:14:05.123Z")).success,
    ).toBe(true);
  });

  it("S1: ai only for ai_result, teacher only for teacher_decision", () => {
    expect(variant(AI_ACCEPTED, (e) => void delete e["ai"]).success).toBe(false);
    expect(
      variant(AI_ACCEPTED, (e) => void (e["teacher"] = TEACHER_CORRECT["teacher"])).success,
    ).toBe(false);
    expect(variant(TEACHER_CORRECT, (e) => void delete e["teacher"]).success).toBe(false);
    expect(variant(TEACHER_CORRECT, (e) => void (e["ai"] = AI_ACCEPTED["ai"])).success).toBe(false);
  });

  it("S2: weight class follows the source", () => {
    expect(variant(AI_ACCEPTED, (e) => void (e["weightClass"] = "professional")).success).toBe(
      false,
    );
    expect(variant(TEACHER_CORRECT, (e) => void (e["weightClass"] = "preliminary")).success).toBe(
      false,
    );
  });

  it("S3: the resolution state follows the label", () => {
    expect(teacherResolutionState("correct")).toBe("resolved");
    expect(teacherResolutionState("needs_practice")).toBe("needs_follow_up");
    expect(teacherResolutionState("poor_audio")).toBe("needs_follow_up");
    expect(
      variant(
        TEACHER_CORRECT,
        (e) => void (obj(e["teacher"])["resolutionState"] = "needs_follow_up"),
      ).success,
    ).toBe(false);
    expect(
      variant(
        TEACHER_NEEDS_PRACTICE,
        (e) => void (obj(e["teacher"])["resolutionState"] = "resolved"),
      ).success,
    ).toBe(false);
    expect(
      variant(TEACHER_POOR_AUDIO, (e) => void (obj(e["teacher"])["resolutionState"] = "resolved"))
        .success,
    ).toBe(false);
    expect(
      variant(TEACHER_CORRECT, (e) => void (obj(e["teacher"])["label"] = "great")).success,
    ).toBe(false);
  });

  it("S4: effects are empty only for poor_audio", () => {
    expect(variant(AI_ACCEPTED, (e) => void (e["effects"] = [])).success).toBe(false);
    expect(variant(TEACHER_CORRECT, (e) => void (e["effects"] = [])).success).toBe(false);
    expect(variant(TEACHER_NEEDS_PRACTICE, (e) => void (e["effects"] = [])).success).toBe(false);
    expect(
      variant(TEACHER_POOR_AUDIO, (e) => void (e["effects"] = AI_ACCEPTED["effects"])).success,
    ).toBe(false);
  });

  it("S5: no repeated effect, at most 32 effects", () => {
    expect(
      variant(AI_ACCEPTED, (e) => void list(e["effects"]).push(clone(list(e["effects"])[0])))
        .success,
    ).toBe(false);
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        competencyId: "6650f0c2a1b2c3d4e5f60e01",
        competencyCode: "QUR_MEM_AYAH",
        effect: "countsAgainst",
        wordIndex: i + 1,
        errorCode: "ERR_MEM_OMISSION",
        confidence: 0.9,
      }));
    expect(variant(AI_ACCEPTED, (e) => void (e["effects"] = many(QURAN_MAX_EFFECTS))).success).toBe(
      true,
    );
    expect(
      variant(AI_ACCEPTED, (e) => void (e["effects"] = many(QURAN_MAX_EFFECTS + 1))).success,
    ).toBe(false);
  });

  it("S6: supports carries nothing, the others carry the word and the code", () => {
    for (const field of ["wordIndex", "errorCode", "confidence"] as const) {
      const value = field === "wordIndex" ? 1 : field === "errorCode" ? "ERR_MEM_OMISSION" : 0.5;
      expect(
        variant(AI_ACCEPTED, (e) => void (obj(list(e["effects"])[0])[field] = value)).success,
      ).toBe(false);
    }
    for (const field of ["wordIndex", "errorCode"] as const) {
      expect(
        variant(AI_ERROR, (e) => void (obj(list(e["effects"])[0])[field] = null)).success,
      ).toBe(false);
    }
    expect(
      variant(AI_ERROR, (e) => void (obj(list(e["effects"])[0])["wordIndex"] = 0)).success,
    ).toBe(false);
    expect(
      variant(AI_ERROR, (e) => void (obj(list(e["effects"])[0])["confidence"] = 1.2)).success,
    ).toBe(false);
    expect(
      variant(AI_ERROR, (e) => void (obj(list(e["effects"])[0])["errorCode"] = "ERR_TAJ_UNMAPPED"))
        .success,
    ).toBe(false);
    expect(
      variant(AI_ERROR, (e) => void (obj(list(e["effects"])[0])["effect"] = "weakens")).success,
    ).toBe(false);
  });

  it("maps every error code to its competency, and only to it", () => {
    for (const code of QURAN_EFFECT_ERROR_CODES) {
      const own = QURAN_ERROR_COMPETENCY[code];
      const ok = variant(AI_ERROR, (e) => {
        const effect = obj(list(e["effects"])[0]);
        effect["errorCode"] = code;
        effect["competencyCode"] = own;
      });
      expect(ok.success).toBe(true);
      const other = own === "QUR_MEM_AYAH" ? "QUR_TAJ_MADD" : "QUR_MEM_AYAH";
      const wrong = variant(AI_ERROR, (e) => {
        const effect = obj(list(e["effects"])[0]);
        effect["errorCode"] = code;
        effect["competencyCode"] = other;
      });
      expect(wrong.success).toBe(false);
    }
  });

  it("accepts a future Quran competency code for supports, and rejects other codes", () => {
    const supports = (code: string) =>
      variant(AI_ACCEPTED, (e) => void (obj(list(e["effects"])[1])["competencyCode"] = code));
    expect(supports("QUR_TAJ_IDGHAM").success).toBe(true);
    for (const code of ["qur_taj_madd", "ARB_WORDS", "QUR_", "QUR_a", `QUR_${"A".repeat(40)}`]) {
      expect(supports(code).success).toBe(false);
    }
  });

  it("S7: the key is derived from the event", () => {
    expect(QURAN_IDEMPOTENCY_KEY_PATTERN.test(String(AI_ACCEPTED["idempotencyKey"]))).toBe(true);
    const wrongKeys = [
      "quran:ai_result:6650f0c2a1b2c3d4e5f60d02:1",
      "quran:teacher_decision:6650f0c2a1b2c3d4e5f60d01:1",
      "quran:ai_result:6650f0c2a1b2c3d4e5f60d01:2",
      "quran:ai_result:6650f0c2a1b2c3d4e5f60d01:0",
      "ai_result:6650f0c2a1b2c3d4e5f60d01:1",
    ];
    for (const key of wrongKeys)
      expect(variant(AI_ACCEPTED, (e) => void (e["idempotencyKey"] = key)).success).toBe(false);
    const teacherKey = `quran:teacher_decision:${String(obj(TEACHER_CORRECT["teacher"])["decisionId"])}:1`;
    expect(variant(TEACHER_CORRECT, (e) => void (e["idempotencyKey"] = teacherKey)).success).toBe(
      true,
    );
    expect(
      variant(
        TEACHER_CORRECT,
        (e) => void (e["idempotencyKey"] = String(AI_ACCEPTED["idempotencyKey"])),
      ).success,
    ).toBe(false);
    const second = variant(AI_ACCEPTED, (e) => {
      e["revision"] = 2;
      e["idempotencyKey"] = "quran:ai_result:6650f0c2a1b2c3d4e5f60d01:2";
    });
    expect(second.success).toBe(true);
  });

  it("S8: an event does not supersede itself", () => {
    expect(variant(AI_ACCEPTED, (e) => void (e["supersedesEventId"] = e["eventId"])).success).toBe(
      false,
    );
  });

  it("S9: a teacher effect has no confidence", () => {
    expect(
      variant(TEACHER_NEEDS_PRACTICE, (e) => void (obj(list(e["effects"])[0])["confidence"] = 0.9))
        .success,
    ).toBe(false);
  });

  it("S10: the label decides the kind of effect", () => {
    expect(
      variant(
        TEACHER_CORRECT,
        (e) => void (obj(list(e["effects"])[0])["effect"] = "diagnosticOnly"),
      ).success,
    ).toBe(false);
    const counts = clone(list(AI_ERROR["effects"])[0]);
    expect(variant(TEACHER_CORRECT, (e) => void (e["effects"] = [counts])).success).toBe(false);
    expect(
      variant(TEACHER_NEEDS_PRACTICE, (e) => void (e["effects"] = AI_ACCEPTED["effects"])).success,
    ).toBe(false);
    const diagnostic = { ...obj(clone(list(AI_GHUNNA["effects"])[0])), confidence: null };
    expect(variant(TEACHER_NEEDS_PRACTICE, (e) => void (e["effects"] = [diagnostic])).success).toBe(
      true,
    );
  });

  it("S11: an error result has no supports, an accepted one may have them", () => {
    expect(
      variant(AI_ERROR, (e) => void list(e["effects"]).push(clone(list(AI_ACCEPTED["effects"])[0])))
        .success,
    ).toBe(false);
    expect(variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["decision"] = "error")).success).toBe(
      false,
    );
    expect(variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["decision"] = "uncertain")).success).toBe(
      false,
    );
  });

  it("restricts the model and the model version to plain identifiers", () => {
    for (const model of ["none", "faster-whisper", "gpt", ""]) {
      expect(variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["model"] = model)).success).toBe(false);
    }
    for (const version of ["free text here", "", "a".repeat(101), "v1;drop", "نص"]) {
      expect(
        variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["modelVersion"] = version)).success,
      ).toBe(false);
    }
    expect(
      variant(AI_ACCEPTED, (e) => void (obj(e["ai"])["modelVersion"] = "obadx/muaalem-model-v3_2"))
        .success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// AI effects (KAN-37 section 6.2)
// ---------------------------------------------------------------------------------------------

describe("computeQuranAiEvidenceEffects", () => {
  it("emits nothing for a quality rejection, the API fallback, or an uncertain result", () => {
    const none = (result: AiResult): QuranAiEffectsOutcome =>
      computeQuranAiEvidenceEffects({ result, competencies: CATALOG, taggedCodes: TAGGED });
    for (const quality of ["silent", "too_short", "too_noisy", "too_long"] as const) {
      expect(none(aiResult({ quality, decision: "uncertain" }))).toEqual({
        emit: false,
        reason: "quality_rejected",
      });
    }
    expect(none(aiFallbackResult(ID.attempt, 20004))).toEqual({
      emit: false,
      reason: "api_fallback",
    });
    expect(
      none(aiResult({ decision: "uncertain", findings: [finding(1, "ERR_MEM_OMISSION", 0.4)] })),
    ).toEqual({
      emit: false,
      reason: "uncertain",
    });
    expect(none(aiResult({ quality: "too_short", decision: "uncertain", model: "none" }))).toEqual({
      emit: false,
      reason: "quality_rejected",
    });
  });

  it("supports QUR_MEM_AYAH and the tagged competencies the AI can detect", () => {
    expect(summary(aiEffects(aiResult()))).toEqual([
      "supports:QUR_MEM_AYAH",
      "supports:QUR_TAJ_MADD",
    ]);
    const tagged = [
      "QUR_TAJ_MADD",
      "QUR_PRON_LETTER",
      "QUR_TAJ_GHUNNA",
      "QUR_FUTURE_RULE",
      "QUR_MEM_AYAH",
    ];
    expect(summary(aiEffects(aiResult(), tagged))).toEqual([
      "supports:QUR_MEM_AYAH",
      "supports:QUR_PRON_LETTER",
      "supports:QUR_TAJ_MADD",
    ]);
    expect(summary(aiEffects(aiResult(), []))).toEqual(["supports:QUR_MEM_AYAH"]);
  });

  it("counts a confident finding against its competency and drops that competency from the supports", () => {
    const effects = aiEffects(aiResult({ findings: [finding(2, "ERR_TAJ_MADD_SHORT", 0.86)] }));
    expect(summary(effects)).toEqual(["countsAgainst:QUR_TAJ_MADD@2", "supports:QUR_MEM_AYAH"]);
    expect(effects[0]).toMatchObject({ errorCode: "ERR_TAJ_MADD_SHORT", confidence: 0.86 });
  });

  it("emits no supports for an error result", () => {
    const effects = aiEffects(
      aiResult({ decision: "error", findings: [finding(1, "ERR_MEM_OMISSION", 0.95)] }),
      ["QUR_MEM_AYAH", "QUR_TAJ_MADD", "QUR_PRON_LETTER"],
    );
    expect(summary(effects)).toEqual(["countsAgainst:QUR_MEM_AYAH@1"]);
  });

  it("records an unapproved code as diagnosticOnly, and counts it once its competency is active", () => {
    const result = aiResult({
      findings: [finding(4, "ERR_TAJ_GHONNA_OMIT", 0.9), finding(2, "ERR_MEM_INSERTION", 0.8)],
    });
    expect(summary(aiEffects(result))).toEqual([
      "diagnosticOnly:QUR_MEM_INSERTION@2",
      "diagnosticOnly:QUR_TAJ_GHUNNA@4",
      "supports:QUR_MEM_AYAH",
      "supports:QUR_TAJ_MADD",
    ]);
    const approved = CATALOG.map((c) => (c.code === "QUR_TAJ_GHUNNA" ? { ...c, active: true } : c));
    expect(summary(aiEffects(result, TAGGED, approved))).toContain(
      "countsAgainst:QUR_TAJ_GHUNNA@4",
    );
  });

  it("orders findings by word and code whatever the input order, and removes repeats", () => {
    const findings = [
      finding(3, "ERR_PRON_HARAKA", 0.9),
      finding(1, "ERR_PRON_LETTER_SUB", 0.9),
      finding(1, "ERR_PRON_LETTER_SUB", 0.8),
      finding(3, "ERR_MEM_OMISSION", 0.9),
    ];
    const forward = summary(aiEffects(aiResult({ findings })));
    const backward = summary(aiEffects(aiResult({ findings: [...findings].reverse() })));
    expect(forward).toEqual(backward);
    expect(forward.slice(0, 3)).toEqual([
      "countsAgainst:QUR_PRON_LETTER@1",
      "countsAgainst:QUR_MEM_AYAH@3",
      "countsAgainst:QUR_PRON_HARAKA@3",
    ]);
  });

  it("skips a code that has no competency", () => {
    const effects = aiEffects(aiResult({ findings: [finding(1, "ERR_TAJ_UNMAPPED", 0.9)] }));
    expect(summary(effects)).toEqual(["supports:QUR_MEM_AYAH", "supports:QUR_TAJ_MADD"]);
  });

  it("fails loudly when the catalog is incomplete or QUR_MEM_AYAH is not active", () => {
    const without = (code: string) => CATALOG.filter((c) => c.code !== code);
    const run = (result: AiResult, catalog: QuranCompetencyRef[]) => () =>
      computeQuranAiEvidenceEffects({ result, competencies: catalog, taggedCodes: TAGGED });
    expect(errorCodeOf(run(aiResult(), without("QUR_MEM_AYAH")))).toBe("COMPETENCY_NOT_SEEDED");
    expect(
      errorCodeOf(
        run(
          aiResult({ decision: "error", findings: [finding(1, "ERR_MEM_OMISSION", 0.9)] }),
          without("QUR_MEM_AYAH"),
        ),
      ),
    ).toBe("COMPETENCY_NOT_SEEDED");
    expect(
      errorCodeOf(
        run(
          aiResult({ findings: [finding(1, "ERR_TAJ_MADD_SHORT", 0.9)] }),
          without("QUR_TAJ_MADD"),
        ),
      ),
    ).toBe("COMPETENCY_NOT_SEEDED");
    const inactive = CATALOG.map((c) => (c.code === "QUR_MEM_AYAH" ? { ...c, active: false } : c));
    expect(errorCodeOf(run(aiResult(), inactive))).toBe("COMPETENCY_NOT_SEEDED");
  });

  it("still emits for the mock model (ingestion in production rejects it)", () => {
    expect(
      computeQuranAiEvidenceEffects({
        result: aiResult({ model: "mock" }),
        competencies: CATALOG,
        taggedCodes: TAGGED,
      }).emit,
    ).toBe(true);
  });

  it("is pure: frozen input, same output, input untouched", () => {
    const result = deepFreeze(
      aiResult({
        findings: [finding(2, "ERR_PRON_HARAKA", 0.9), finding(1, "ERR_MEM_OMISSION", 0.9)],
      }),
    );
    const catalog = deepFreeze(clone(CATALOG));
    const tagged = deepFreeze([...TAGGED]);
    const first = computeQuranAiEvidenceEffects({
      result,
      competencies: catalog,
      taggedCodes: tagged,
    });
    const second = computeQuranAiEvidenceEffects({
      result,
      competencies: catalog,
      taggedCodes: tagged,
    });
    expect(first).toEqual(second);
    expect(result.findings.map((f) => f.wordIndex)).toEqual([2, 1]);
  });

  it("builds effects that always pass the effect schema", () => {
    const codes = [...QURAN_EFFECT_ERROR_CODES];
    for (const code of codes) {
      for (const decision of ["accepted", "error"] as const) {
        const effects = aiEffects(aiResult({ decision, findings: [finding(1, code, 0.9)] }), [
          ...TAGGED,
          "QUR_PRON_LETTER",
        ]);
        for (const effect of effects)
          expect(quranEvidenceEffectSchema.safeParse(effect).success).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Teacher effects (KAN-37 section 6.3)
// ---------------------------------------------------------------------------------------------

describe("computeQuranTeacherEvidenceEffects", () => {
  const teacher = (
    label: "correct" | "needs_practice" | "poor_audio",
    confirmedFindings: {
      wordIndex: number;
      errorCode: (typeof QURAN_EFFECT_ERROR_CODES)[number];
    }[] = [],
    taggedCodes: readonly string[] = TAGGED,
    catalog: QuranCompetencyRef[] = CATALOG,
  ) =>
    computeQuranTeacherEvidenceEffects({
      label,
      confirmedFindings,
      competencies: catalog,
      taggedCodes,
    });

  it("poor_audio has no effects, whatever else is given", () => {
    expect(teacher("poor_audio")).toEqual([]);
    expect(teacher("poor_audio", [{ wordIndex: 1, errorCode: "ERR_MEM_OMISSION" }])).toEqual([]);
  });

  it("correct supports QUR_MEM_AYAH and the tagged detectable competencies, and ignores confirmed findings", () => {
    expect(summary(teacher("correct"))).toEqual(["supports:QUR_MEM_AYAH", "supports:QUR_TAJ_MADD"]);
    expect(
      summary(
        teacher("correct", [{ wordIndex: 1, errorCode: "ERR_MEM_OMISSION" }], ["QUR_TAJ_GHUNNA"]),
      ),
    ).toEqual(["supports:QUR_MEM_AYAH"]);
  });

  it("needs_practice counts only the confirmed errors against their competencies, with no confidence", () => {
    const effects = teacher("needs_practice", [
      { wordIndex: 3, errorCode: "ERR_TAJ_GHONNA_OMIT" },
      { wordIndex: 1, errorCode: "ERR_TAJ_MADD_SHORT" },
      { wordIndex: 1, errorCode: "ERR_TAJ_MADD_SHORT" },
    ]);
    expect(summary(effects)).toEqual([
      "countsAgainst:QUR_TAJ_MADD@1",
      "diagnosticOnly:QUR_TAJ_GHUNNA@3",
    ]);
    expect(effects.every((e) => e.confidence === null)).toBe(true);
  });

  it("needs_practice without a confirmed finding is an error", () => {
    expect(errorCodeOf(() => teacher("needs_practice"))).toBe("NEEDS_PRACTICE_WITHOUT_FINDING");
  });

  it("rejects an invalid confirmed finding", () => {
    expect(
      errorCodeOf(() =>
        teacher("needs_practice", [{ wordIndex: 0, errorCode: "ERR_MEM_OMISSION" }]),
      ),
    ).toBe("INVALID_ARGUMENT");
    expect(
      errorCodeOf(() =>
        teacher("needs_practice", [{ wordIndex: 1.5, errorCode: "ERR_MEM_OMISSION" }]),
      ),
    ).toBe("INVALID_ARGUMENT");
    const unmapped = { wordIndex: 1, errorCode: "ERR_TAJ_UNMAPPED" } as unknown as {
      wordIndex: number;
      errorCode: "ERR_MEM_OMISSION";
    };
    expect(errorCodeOf(() => teacher("needs_practice", [unmapped]))).toBe("INVALID_ARGUMENT");
  });

  it("fails loudly when a competency is not seeded", () => {
    const without = (code: string) => CATALOG.filter((c) => c.code !== code);
    expect(errorCodeOf(() => teacher("correct", [], TAGGED, without("QUR_MEM_AYAH")))).toBe(
      "COMPETENCY_NOT_SEEDED",
    );
    expect(
      errorCodeOf(() =>
        teacher(
          "needs_practice",
          [{ wordIndex: 1, errorCode: "ERR_TAJ_MADD_SHORT" }],
          TAGGED,
          without("QUR_TAJ_MADD"),
        ),
      ),
    ).toBe("COMPETENCY_NOT_SEEDED");
  });

  it("builds effects that pass the effect schema, and is pure", () => {
    const input = deepFreeze({
      label: "needs_practice" as const,
      confirmedFindings: [{ wordIndex: 2, errorCode: "ERR_PRON_HARAKA" as const }],
      competencies: clone(CATALOG),
      taggedCodes: [...TAGGED],
    });
    const first = computeQuranTeacherEvidenceEffects(input);
    expect(computeQuranTeacherEvidenceEffects(input)).toEqual(first);
    for (const effect of first)
      expect(quranEvidenceEffectSchema.safeParse(effect).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------------------------

describe("quranEvidenceIdempotencyKey", () => {
  it("builds quran:{source}:{sourceId}:{revision}", () => {
    expect(quranEvidenceIdempotencyKey("ai_result", ID.attempt)).toBe(
      `quran:ai_result:${ID.attempt}:1`,
    );
    expect(quranEvidenceIdempotencyKey("teacher_decision", ID.attempt, 3)).toBe(
      `quran:teacher_decision:${ID.attempt}:3`,
    );
    expect(
      QURAN_IDEMPOTENCY_KEY_PATTERN.test(quranEvidenceIdempotencyKey("ai_result", ID.attempt, 12)),
    ).toBe(true);
  });

  it("is the same every time, and refuses a bad source id or revision", () => {
    expect(quranEvidenceIdempotencyKey("ai_result", ID.attempt, 2)).toBe(
      quranEvidenceIdempotencyKey("ai_result", ID.attempt, 2),
    );
    expect(errorCodeOf(() => quranEvidenceIdempotencyKey("ai_result", "not-an-id"))).toBe(
      "INVALID_ARGUMENT",
    );
    expect(errorCodeOf(() => quranEvidenceIdempotencyKey("ai_result", ID.attempt, 0))).toBe(
      "INVALID_ARGUMENT",
    );
    expect(errorCodeOf(() => quranEvidenceIdempotencyKey("ai_result", ID.attempt, 1.5))).toBe(
      "INVALID_ARGUMENT",
    );
  });

  it("matches the key of every documented example", () => {
    for (const example of examples) {
      const source = example["source"] as "ai_result" | "teacher_decision";
      const sourceId =
        source === "ai_result"
          ? String(example["attemptId"])
          : String(obj(example["teacher"])["decisionId"]);
      expect(quranEvidenceIdempotencyKey(source, sourceId, Number(example["revision"]))).toBe(
        example["idempotencyKey"],
      );
    }
  });
});
