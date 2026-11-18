# MongoDB core schema

Owners: Mohammad / Osama. Decision record: `docs/adr/0003-mongodb.md`. The source of truth is the
mongoose models in `apps/api/src/Models/`; this page is the overview. Who may read and change each
collection: `apps/api/docs/authorization-matrix.md`.

## Rules

- Ids are MongoDB ObjectIds. Access never depends on an id being hard to guess.
- Every child-owned document carries `familyId` and `childId`, and every lookup uses the family
  from the server (`Child.findOwned`). Model hooks check that the child belongs to the family
  (`utils/assertChildInFamily.js`).
- Teachers will see a child only through an active teacher assignment (no teacher routes yet).
- Multi-document changes use transactions (replica set).

## Collections

| Model               | Purpose                                        | Ownership                          | Indexes                                                       |
| ------------------- | ---------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `User`              | Parents and staff (children have no login)     | the user's own id                  | `role + status`                                               |
| `Family`            | Household; one per parent                      | `parentId`                         | `parentId` (unique)                                           |
| `Child`             | Child profile: name, date of birth, levels     | `familyId`                         | `familyId + status`                                           |
| `ConsentRecord`     | Parent consent, append-only                    | `familyId`, `childId`              | `childId + createdAt`                                         |
| `Content`           | Lessons, Quran tasks, missions, with review    | none (global)                      | `competencies`                                                |
| `Competency`        | Growth Graph competencies per domain           | none (reference data)              | `code` (unique), `domain + active`                            |
| `Progress`          | A child's state on one content item            | `familyId`, `childId`              | `childId + contentId` (unique), `familyId + childId + status` |
| `Assessment`        | A placement or check, with its item answers    | `familyId`, `childId`              | `familyId + childId + status`                                 |
| `QuranAttempt`      | One recorded ayah and its AI result (no audio) | `familyId`, `childId`              | `childId + clientAttemptId` (unique), `familyId + childId`    |
| `TeacherAssignment` | Which teacher may see which child              | `teacherId`, `childId`, `familyId` | `teacherId + status`, `childId + status`                      |
| `AuditEvent`        | Append-only audit log (ids only, short `meta`) | none                               | by target, actor, action and time                             |

The audio of a recitation is never stored: the API sends it to the AI service and drops it.

## Questions to answer

1. Which fields are personal data, and what is the retention for each?
2. How is a child deleted or exported on a parent's request?
3. How long are audit events kept, and what job deletes them?
