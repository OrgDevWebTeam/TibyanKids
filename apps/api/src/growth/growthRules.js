// How evidence becomes a growth state (FR-GRW-001, FR-GRW-002, FR-FAM-004, VAL-005).
// Pure functions with no database: easy to read and to test. Every number is in GROWTH_RULES.
// The CRS gives no numbers, so these are the project's chosen starting rules (see docs/growth-model.md).

export const GROWTH_RULES = Object.freeze({
  // How much each result counts as evidence of the competency
  RESULT_SCORE: Object.freeze({ met: 1, partly_met: 0.5, not_met: 0 }),

  // How much each kind of source counts. A parent's observation is the weakest: one observation
  // is never definitive proof (VAL-005, FR-FAM-004).
  SOURCE_WEIGHT: Object.freeze({ assessment: 0.8, activity: 0.5, observation: 0.3 }),

  // Only the newest evidence decides the level, so a child's growth shows
  RECENT_EVIDENCE_LIMIT: 10,

  // The highest level the evidence allows, by how many pieces of evidence there are
  // (index = number of pieces, the last value applies from there on). One piece of evidence can
  // never reach the top levels (VAL-005).
  MAX_LEVEL_BY_EVIDENCE_COUNT: Object.freeze([0, 2, 3, 4, 4, 5]),

  // How sure the state is: enough pieces and enough total weight
  CONFIDENCE: Object.freeze({
    high: Object.freeze({ minCount: 5, minWeight: 3 }),
    medium: Object.freeze({ minCount: 3, minWeight: 1.5 }),
  }),

  // A domain with fewer than this share of its competencies assessed is never better than "low"
  MIN_COVERAGE_FOR_DOMAIN_CONFIDENCE: 0.5,

  // A completed activity: its score decides the result. No score: only taking part is proven.
  ACTIVITY_MET_SCORE: 70,
  ACTIVITY_PARTLY_SCORE: 40,

  // A completed assessment: its level (0 to 5) decides the result
  ASSESSMENT_MET_LEVEL: 4,
  ASSESSMENT_PARTLY_LEVEL: 2,
});

const CONFIDENCE_ORDER = ["low", "medium", "high"];

export function resultForActivityScore(score) {
  if (score == null) return "partly_met";
  if (score >= GROWTH_RULES.ACTIVITY_MET_SCORE) return "met";
  if (score >= GROWTH_RULES.ACTIVITY_PARTLY_SCORE) return "partly_met";
  return "not_met";
}

export function resultForAssessmentLevel(level) {
  if (level >= GROWTH_RULES.ASSESSMENT_MET_LEVEL) return "met";
  if (level >= GROWTH_RULES.ASSESSMENT_PARTLY_LEVEL) return "partly_met";
  return "not_met";
}

/**
 * The state of one competency from its evidence. Each event is { weight, result, occurredAt }.
 * No evidence means "not assessed": no level at all, which is different from a low level.
 */
export function deriveCompetencyState(events) {
  if (events.length === 0) {
    return {
      status: "not_assessed",
      level: null,
      confidence: null,
      evidenceCount: 0,
      lastEvidenceAt: null,
    };
  }

  const newestFirst = [...events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const recent = newestFirst.slice(0, GROWTH_RULES.RECENT_EVIDENCE_LIMIT);

  const totalWeight = recent.reduce((sum, e) => sum + e.weight, 0);
  const weightedScore = recent.reduce(
    (sum, e) => sum + e.weight * GROWTH_RULES.RESULT_SCORE[e.result],
    0,
  );
  const average = totalWeight > 0 ? weightedScore / totalWeight : 0;

  const caps = GROWTH_RULES.MAX_LEVEL_BY_EVIDENCE_COUNT;
  const cap = caps[Math.min(recent.length, caps.length - 1)];
  const level = Math.min(Math.round(average * 5), cap);

  const { high, medium } = GROWTH_RULES.CONFIDENCE;
  let confidence = "low";
  if (recent.length >= high.minCount && totalWeight >= high.minWeight) confidence = "high";
  else if (recent.length >= medium.minCount && totalWeight >= medium.minWeight)
    confidence = "medium";

  return {
    status: "assessed",
    level,
    confidence,
    evidenceCount: events.length,
    lastEvidenceAt: new Date(newestFirst[0].occurredAt),
  };
}

/**
 * The next goal of a domain: a competency that was never assessed comes first, otherwise the
 * assessed one with the lowest level below 5, otherwise nothing. Ties go to the lower code.
 * competencies: [{ _id, code }]. states: a Map from the competency id (as text) to { status, level }.
 */
export function chooseNextGoal(competencies, states) {
  const sorted = [...competencies].sort((a, b) => a.code.localeCompare(b.code));
  const stateOf = (c) => states.get(String(c._id));

  const unassessed = sorted.find((c) => stateOf(c)?.status !== "assessed");
  if (unassessed) return unassessed._id;

  let best = null;
  for (const c of sorted) {
    const level = stateOf(c).level;
    if (level < 5 && (best === null || level < stateOf(best).level)) best = c;
  }
  return best ? best._id : null;
}

/**
 * The state of a whole domain, from its competencies (FR-GRW-001 output: domain-level growth state).
 * competencies: the active competencies of the domain. states: their GrowthState records, if any.
 */
export function summarizeDomain(competencies, states) {
  const assessed = states.filter((s) => s.status === "assessed");
  const base = {
    totalCompetencies: competencies.length,
    assessedCompetencies: assessed.length,
  };

  if (assessed.length === 0) {
    return { ...base, status: "not_assessed", level: null, confidence: null, evidenceCount: 0 };
  }

  const evidenceCount = assessed.reduce((sum, s) => sum + s.evidenceCount, 0);
  const level = Math.round(
    assessed.reduce((sum, s) => sum + s.level * s.evidenceCount, 0) / evidenceCount,
  );

  const weakest = assessed.reduce(
    (min, s) => Math.min(min, CONFIDENCE_ORDER.indexOf(s.confidence)),
    CONFIDENCE_ORDER.length - 1,
  );
  const coverage = assessed.length / Math.max(competencies.length, assessed.length);
  const confidence =
    coverage < GROWTH_RULES.MIN_COVERAGE_FOR_DOMAIN_CONFIDENCE ? "low" : CONFIDENCE_ORDER[weakest];

  return { ...base, status: "assessed", level, confidence, evidenceCount };
}
