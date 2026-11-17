import AuditEvent from "../Models/AuditEvent.js";
import { recordAudit } from "../utils/audit.js";
import { auditEventsQuery, auditExportQuery } from "../validations/adminValidation.js";

// Builds the database filter from the validated query
function buildFilter({ from, to, ...filters }) {
  const filter = { ...filters };
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  return filter;
}

// FR-ADM-002: a platform admin inspects audit events. Read-only, newest first, paginated.
// Audit events carry no child data, secrets or free text, so they are returned as stored.
export async function listAuditEvents(req, res) {
  const { page, limit, ...rest } = auditEventsQuery.parse(req.query);
  const filter = buildFilter(rest);

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

// An export is capped, so one request cannot read the whole log at once
export const MAX_EXPORT_ROWS = 5000;

const CSV_COLUMNS = [
  "createdAt",
  "action",
  "result",
  "actorId",
  "actorRole",
  "targetType",
  "targetId",
  "meta",
];

function csvCell(value) {
  let text = "";
  if (value instanceof Date) text = value.toISOString();
  else if (value && typeof value === "object" && typeof value.toHexString !== "function") {
    text = JSON.stringify(value);
  } else if (value != null) text = String(value);

  // A cell that starts like a formula would run in a spreadsheet (CSV injection): keep it as text
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// FR-ADM-002 "audit view/export": the same filters, as a CSV file. Exporting the log is an
// administrative action, so it is written to the log first. If that fails, nothing is exported.
export async function exportAuditEvents(req, res) {
  const query = auditExportQuery.parse(req.query);
  const filter = buildFilter(query);

  const names = Object.keys(query).join(",") || "none";
  await recordAudit({
    actor: req.user,
    action: "audit.exported",
    meta: { reason: `filters: ${names}`.slice(0, 200) },
  });

  // One more row than the cap, to know whether the export was cut short
  const rows = await AuditEvent.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const truncated = rows.length > MAX_EXPORT_ROWS;
  const exported = truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;

  const lines = [CSV_COLUMNS.join(",")];
  for (const row of exported) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  }

  const day = new Date().toISOString().slice(0, 10);
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="audit-events-${day}.csv"`,
    "Cache-Control": "no-store",
    "X-Export-Truncated": String(truncated),
  });
  res.send(lines.join("\r\n") + "\r\n");
}
