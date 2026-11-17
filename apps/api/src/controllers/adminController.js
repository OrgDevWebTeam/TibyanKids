import AuditEvent from "../Models/AuditEvent.js";
import { auditEventsQuery } from "../validations/adminValidation.js";

// FR-ADM-002: a platform admin inspects audit events. Read-only, newest first, paginated.
// Audit events carry no child data, secrets or free text, so they are returned as stored.
export async function listAuditEvents(req, res) {
  const { page, limit, from, to, ...filters } = auditEventsQuery.parse(req.query);

  const filter = { ...filters };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total] = await Promise.all([
    AuditEvent.find(filter)
      .select("-__v")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditEvent.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    total,
    page,
    pages: Math.ceil(total / limit),
    items,
  });
}
