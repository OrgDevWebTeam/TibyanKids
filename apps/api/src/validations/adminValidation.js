import { z } from "zod";
import { AUDIT_ACTIONS } from "../utils/audit.js";
import { objectId, oneOf } from "./helpers.js";

// Filters shared by the admin audit view and its export (FR-ADM-002)
const filterFields = {
  action: oneOf("Action", AUDIT_ACTIONS).optional(),
  result: oneOf("Result", ["success", "failure", "denied"]).optional(),
  actorId: objectId("Actor id").optional(),
  targetId: objectId("Target id").optional(),
  from: z.coerce.date({ error: "From must be a date, for example 2026-11-01" }).optional(),
  to: z.coerce.date({ error: "To must be a date, for example 2026-11-30" }).optional(),
};

const dateOrder = [
  (q) => !q.from || !q.to || q.from <= q.to,
  { message: "From must not be after to", path: ["from"] },
];

// The audit view: filters and pagination. Unknown parameters are refused.
export const auditEventsQuery = z
  .object({
    ...filterFields,
    page: z.coerce.number({ error: "Page must be a number" }).int().min(1).default(1),
    limit: z.coerce
      .number({ error: "Limit must be a number" })
      .int()
      .min(1)
      .max(100, "Limit can be at most 100")
      .default(20),
  })
  .strict()
  .refine(...dateOrder);

// The export: the same filters, no pagination
export const auditExportQuery = z
  .object(filterFields)
  .strict()
  .refine(...dateOrder);
