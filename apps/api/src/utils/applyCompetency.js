import Competency from "../Models/Competency.js";

/**
 * For a new growth record: the competency must exist and be active, and the record takes its
 * domain from the competency, so the two can never disagree.
 */
export async function applyCompetency(doc) {
  // The competency id is immutable, so this only needs to run when the record is first created.
  if (!doc.isNew || !doc.competencyId) return;

  const competency = await Competency.findById(doc.competencyId).select("domain active");

  if (!competency) {
    doc.invalidate("competencyId", "Competency does not exist");
    return;
  }

  if (!competency.active) {
    doc.invalidate("competencyId", "Competency is not active");
    return;
  }

  doc.domain = competency.domain;
}
