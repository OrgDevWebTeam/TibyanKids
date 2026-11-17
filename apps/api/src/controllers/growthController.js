import Child from "../Models/Child.js";
import Competency from "../Models/Competency.js";
import EvidenceEvent from "../Models/EvidenceEvent.js";
import GrowthState from "../Models/GrowthState.js";
import { DOMAINS } from "../constants/index.js";
import { chooseNextGoal, summarizeDomain } from "../growth/growthRules.js";
import AppError from "../utils/AppError.js";
import { auditIfOtherFamily } from "../utils/auditCrossFamily.js";

// API-004 / FR-GRW-003: the Growth Map of one child, for the child's parent.
// All five domains are always listed. A domain with no evidence says "not_assessed" and has no
// level, which is not the same as a low level (FR-GRW-001).
export async function getGrowth(req, res) {
  const child = await Child.findOwned(req.params.id, req.family._id).where("status").ne("archived");

  if (!child) {
    await auditIfOtherFamily(req, req.params.id);
    throw new AppError(404, "Child not found");
  }

  const [competencies, states, recent] = await Promise.all([
    Competency.find({ active: true }).sort({ domain: 1, code: 1 }).lean(),
    GrowthState.find({ childId: child._id }).lean(),
    EvidenceEvent.find({ childId: child._id })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(5)
      .select("competencyId domain sourceType result occurredAt")
      .lean(),
  ]);

  const stateById = new Map(states.map((s) => [String(s.competencyId), s]));

  const domains = DOMAINS.map((domain) => {
    const inDomain = competencies.filter((c) => c.domain === domain);
    const domainStates = inDomain.map((c) => stateById.get(String(c._id))).filter(Boolean);

    const goalId = inDomain.length > 0 ? chooseNextGoal(inDomain, stateById) : null;
    const goal = goalId ? inDomain.find((c) => String(c._id) === String(goalId)) : null;

    return {
      domain,
      ...summarizeDomain(inDomain, domainStates),
      nextGoal: goal ? { id: goal._id, code: goal.code, name: goal.name } : null,
      competencies: inDomain.map((c) => {
        const state = stateById.get(String(c._id));
        return {
          id: c._id,
          code: c.code,
          name: c.name,
          status: state?.status ?? "not_assessed",
          level: state?.level ?? null,
          confidence: state?.confidence ?? null,
          evidenceCount: state?.evidenceCount ?? 0,
        };
      }),
    };
  });

  res.json({
    status: "success",
    childId: child._id,
    domains,
    recentEvidence: recent.map((e) => ({
      competencyId: e.competencyId,
      domain: e.domain,
      sourceType: e.sourceType,
      result: e.result,
      occurredAt: e.occurredAt,
    })),
  });
}
