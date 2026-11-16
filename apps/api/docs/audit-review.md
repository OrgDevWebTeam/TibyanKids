# Audit Review (SEC-007)

Date: 2026-11-16
Scope: audit logging in `apps/api`, reviewed against SEC-007, FR-ADM-002 and `docs/authorization-matrix.md` (rule 6).

SEC-007: "Audit logs shall cover consent, role changes, sensitive data access, content publication and administrative actions."

## Coverage of SEC-007

| Category               | Event name                             | Written today? | Where / why not                                                                     | Test                                      |
| ---------------------- | -------------------------------------- | -------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| Consent                | `consent.granted`, `consent.withdrawn` | Yes            | `consentController`, in the same transaction as the change                          | `tests/api/audit-coverage.test.js`        |
| Content publication    | `content.published`                    | Yes            | `contentController`, in the same transaction as the change                          | Not automated: needs a content-admin user |
| Role changes           | `role.changed`                         | No             | The event name exists, but no route changes roles yet (FR-ADM-001 is not built)     | `todo` in the coverage test               |
| Sensitive data access  | `child.data_accessed`                  | No             | The event name exists, but nothing writes it. Needs a decision (see Open questions) | `todo` in the coverage test               |
| Administrative actions | `user.suspended`                       | No             | The event name exists, but no admin routes exist yet                                | `todo` in the coverage test               |

Also written: `access.denied` (result `denied`) when a role check refuses a request (`authorize` middleware) and when a creator tries to approve their own content.

## How the log protects itself

- **Append-only.** Updates through `save()`, `updateOne`, `updateMany`, `findOneAndUpdate`, `findOneAndReplace`, `replaceOne` and `bulkWrite` are blocked by hooks, and so are deletes through `deleteOne`, `deleteMany`, `findOneAndDelete`, a loaded document and `bulkWrite`. Tests cover `save()`, `updateOne()` and all four delete paths (`tests/models/audit.test.js`). The `bulkWrite` update guard is not tested. These guards stop the application only: deployed environments still need a database user with insert-only rights on the audit collection (ADR-0003).
- **Fixed action names.** `recordAudit()` rejects any action that is not in `AUDIT_ACTIONS`, so a misspelled action cannot create a hole.
- **No sensitive content.** `meta` accepts only the keys in `ALLOWED_META_KEYS` and only short text. A test checks that a child's name, a password and a token never appear in the events.
- **Consistency.** Consent and publishing write the audit event in the same transaction, so a failed audit write means no change. A failed audit write for a denied role check does not stop the denial.

## Findings

| #   | Finding                                                                                                                                                                                                                         | Severity | Recommended fix                                                                                             | Status                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Another family's child gives 404 and nothing is logged, although matrix rule 6 says denied actions are audited, and CRS Section 12 lists "unauthorized access attempts" as a safety metric. (Same as authorization review F13.) | Medium   | Look the child up by id first. If it belongs to another family, write `access.denied` and still return 404. | Fixed: `auditIfOtherFamily` helper (`src/utils/auditCrossFamily.js`), used by the children and consent routes, covered by `audit-coverage.test.js`                                                       |
| A2  | Audit entries can be deleted: no guard exists for `deleteOne`, `deleteMany` or `findOneAndDelete`. (Same as F7.)                                                                                                                | Low      | Add hooks that throw, plus a test. Only a future retention job may delete entries.                          | Fixed: guards for `deleteOne`, `deleteMany`, `findOneAndDelete`, a loaded document and `bulkWrite`, covered by `audit.test.js`. Application level only: ADR-0003 also wants an insert-only database user |
| A3  | No admin view of the audit log (FR-ADM-002: platform admin only, paginated, read-only).                                                                                                                                         | Medium   | Build after staff accounts exist (FR-ADM-001).                                                              | Open                                                                                                                                                                                                     |
| A4  | `role.changed`, `user.suspended` and `child.data_accessed` are defined but never written.                                                                                                                                       | Medium   | Write them when the routes that cause them are built. Keep the `todo` tests until then.                     | Open                                                                                                                                                                                                     |
| A5  | No retention policy for audit events is defined.                                                                                                                                                                                | Low      | Ask the PM for a retention period.                                                                          | Open                                                                                                                                                                                                     |

## Open questions for the PM

1. Does a parent reading their own child's data count as "sensitive data access", or only access by teachers and admins?
2. Should refused cross-family attempts (a parent asking for another family's child) be logged as `access.denied`? Implemented as recommended (A1); please confirm.
3. How long are audit events kept, and who runs the deletion (A5)?
4. Who may read the audit log? The CRS says platform admin only, restricted.

## Tests

- `tests/models/audit.test.js`: validation, and the append-only rules for updates and deletes.
- `tests/api/audit-coverage.test.js`: consent and denied-access events are written, other-family attempts on a child are logged, and the log holds no child data, passwords or tokens.
