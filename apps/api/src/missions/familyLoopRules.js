// The family loop: a home mission, a parent's observation, a child's reflection (FR-FAM-001 to FR-FAM-004).
// Pure values and functions with no database: easy to read and to test. Every number is in
// FAMILY_LOOP_RULES. The CRS gives no numbers, so these are the project's chosen starting rules.

export const FAMILY_LOOP_RULES = Object.freeze({
  // A mission expires this many days after it was assigned
  ASSIGNMENT_LIFETIME_DAYS: 7,

  // A child never has more open missions than this, so a family is not buried
  MAX_PENDING_ASSIGNMENTS: 3,

  // The longest note a parent can add to an observation
  NOTE_MAX_LENGTH: 500,

  // Completing one of these kinds of content can trigger a mission
  SOURCE_CONTENT_TYPES: Object.freeze(["lesson", "story"]),

  // Growth level (0 to 5) at which a competency counts as "achieved" or "practising" for mission
  // selection. Below the practising level it "needs practice".
  ACHIEVED_LEVEL: 4,
  PRACTISING_LEVEL: 3,
});

// What a parent saw their child do
export const OBSERVATION_STATUSES = Object.freeze(["independent", "reminder", "not_observed"]);

// The evidence result of each observation status. "not_observed" is deliberately missing:
// not seeing the child do something is no evidence at all, and must never count as "not met".
export const OBSERVATION_RESULT = Object.freeze({
  independent: "met",
  reminder: "partly_met",
});

// How the child felt about the mission. Fixed choices, never free text. Never evidence.
export const REFLECTION_CHOICES = Object.freeze([
  "enjoyed_it",
  "proud",
  "want_more",
  "was_hard",
  "not_sure",
]);

// completed (observed), expired (not observed in time) or pending. `now` is a parameter so the
// answer can be tested for any date.
export function assignmentStatus({ completedAt, expiresAt }, now = new Date()) {
  if (completedAt) return "completed";
  if (now > expiresAt) return "expired";
  return "pending";
}

// The expiry date of a mission assigned at `assignedAt`
export function expiryFor(assignedAt) {
  const lifetimeMs = FAMILY_LOOP_RULES.ASSIGNMENT_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
  return new Date(assignedAt.getTime() + lifetimeMs);
}

// Translates a growth state ({ status, level } or nothing) into the four statuses that the mission
// selection (ADR-0008) understands: not_assessed, needs_practice, practising, achieved.
export function competencyStatusFromGrowth(state) {
  if (!state || state.status !== "assessed" || typeof state.level !== "number") {
    return "not_assessed";
  }
  if (state.level >= FAMILY_LOOP_RULES.ACHIEVED_LEVEL) return "achieved";
  if (state.level >= FAMILY_LOOP_RULES.PRACTISING_LEVEL) return "practising";
  return "needs_practice";
}
