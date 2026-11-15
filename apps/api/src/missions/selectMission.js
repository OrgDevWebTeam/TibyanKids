// Rule-based Family Loop mission selection (KAN-34). Rules: docs/adr/0008-rule-based-mission-selection.md
//
// A pure function: no database, no model, no randomness, no clock. The same inputs always give the
// same mission, and every answer says which rule chose it (reasonRule), so a parent or teacher can
// see why. It reads only an age band, levels, competency codes and statuses, and content ids: never
// a name, a date of birth or free text.

export const RULES_VERSION = "1.0";

// ADR-0008 §2 (values proposed, to confirm with Ola and Mohammad)
export const AGE_BAND_RULES = Object.freeze({
  "6-8": Object.freeze({ maxMinutes: 10 }),
  "9-11": Object.freeze({ maxMinutes: 15 }),
  "12-14": Object.freeze({ maxMinutes: 20 }),
});

// Domains where the child has a level (Child.quranLevel, Child.arabicLevel)
const LEVELLED_DOMAINS = new Set(["quran", "arabic"]);

export const STATUSES = Object.freeze(["not_assessed", "practising", "needs_practice", "achieved"]);

// ADR-0008 §3 step 2: the most urgent status of a mission's competencies gives its rank
const URGENCY = [
  { status: "needs_practice", rank: 2, reasonRule: "RULE_NEEDS_PRACTICE" },
  { status: "not_assessed", rank: 3, reasonRule: "RULE_NOT_ASSESSED" },
  { status: "practising", rank: 4, reasonRule: "RULE_PRACTISING" },
];

function fitsLevel(mission, levels) {
  const level = levels[mission.domain];
  if (!LEVELLED_DOMAINS.has(mission.domain) || level === undefined || level === null) {
    return true;
  }
  // At the child's level or one above
  return mission.level >= Math.max(1, level) && mission.level <= Math.min(5, level + 1);
}

function rankOf(mission, competencyStatus, focusCompetency) {
  const codes = mission.competencyCodes ?? [];
  if (focusCompetency && codes.includes(focusCompetency)) {
    return { rank: 1, reasonRule: "RULE_FOCUS", competencyCode: focusCompetency };
  }
  for (const { status, rank, reasonRule } of URGENCY) {
    const code = codes.find((c) => (competencyStatus[c] ?? "not_assessed") === status);
    if (code) return { rank, reasonRule, competencyCode: code };
  }
  return { rank: 5, reasonRule: "RULE_ALL_ACHIEVED", competencyCode: null };
}

// Lower rank first, then lower level, then shorter, then content id: an order that never changes
function compare(a, b) {
  return (
    a.rank - b.rank ||
    a.mission.level - b.mission.level ||
    a.mission.estimatedMinutes - b.mission.estimatedMinutes ||
    (a.mission.id < b.mission.id ? -1 : a.mission.id > b.mission.id ? 1 : 0)
  );
}

function answer(choice, reasonRule) {
  return {
    contentId: choice ? choice.mission.id : null,
    reasonRule,
    competencyCode: choice ? choice.competencyCode : null,
    rulesVersion: RULES_VERSION,
  };
}

/**
 * Chooses today's mission for one child (ADR-0008 §3).
 *
 * @param {object} input
 * @param {"6-8"|"9-11"|"12-14"} input.ageBand
 * @param {{quran?: number, arabic?: number}} [input.levels] Levels 0-5 per domain
 * @param {Record<string, string>} [input.competencyStatus] Status per competency code; missing = not_assessed
 * @param {Array<{id: string, ageBand: string, domain: string, level: number, estimatedMinutes: number,
 *   competencyCodes: string[]}>} input.missions Published missions only
 * @param {string[]} [input.recentMissionIds] Newest first
 * @param {string} [input.domain] Only missions of this domain
 * @param {string} [input.focusCompetency] For example the value of a wrong Asia & Sham answer
 * @returns {{contentId: string|null, reasonRule: string, competencyCode: string|null, rulesVersion: string}}
 */
export function selectMission({
  ageBand,
  levels = {},
  competencyStatus = {},
  missions,
  recentMissionIds = [],
  domain,
  focusCompetency,
}) {
  const band = AGE_BAND_RULES[ageBand];
  if (!band) throw new TypeError(`Unknown age band: ${ageBand}`);
  for (const [code, status] of Object.entries(competencyStatus)) {
    if (!STATUSES.includes(status)) throw new TypeError(`Unknown status for ${code}: ${status}`);
  }

  // Step 1: filter. A mission not written for the child's age band is never given.
  const ranked = missions
    .filter(
      (m) =>
        m.ageBand === ageBand &&
        m.estimatedMinutes <= band.maxMinutes &&
        (!domain || m.domain === domain) &&
        fitsLevel(m, levels),
    )
    // Step 2: rank
    .map((mission) => ({ mission, ...rankOf(mission, competencyStatus, focusCompetency) }))
    .sort(compare);

  if (ranked.length === 0) return answer(null, "RULE_NO_MISSION");

  // Step 3: no repeats; if all were given recently, the one given longest ago
  const recent = new Map(recentMissionIds.map((id, index) => [id, index]));
  const fresh = ranked.find((r) => !recent.has(r.mission.id));
  if (fresh) return answer(fresh, fresh.reasonRule);

  const oldest = ranked.reduce((a, b) =>
    recent.get(b.mission.id) > recent.get(a.mission.id) ? b : a,
  );
  return answer(oldest, "RULE_REPEAT");
}

/**
 * Turns a published mission Content document into the input selectMission() needs.
 * codeById maps a competency id (as a string) to its code.
 */
export function toMissionInput(content, codeById) {
  return {
    id: String(content._id),
    ageBand: content.ageBand,
    domain: content.domain,
    level: content.level,
    estimatedMinutes: content.estimatedMinutes,
    competencyCodes: (content.competencies ?? [])
      .map((id) => codeById.get(String(id)))
      .filter(Boolean),
  };
}
