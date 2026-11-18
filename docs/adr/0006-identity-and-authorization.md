# ADR-0006: Identity and authorization

- Status: Accepted for the prototype. Revised 2026-11-18: the first version proposed OIDC sign-in
  through an outside identity provider, staff MFA and a child PIN. That code was removed with the
  old API (#41). This version describes what `apps/api` does now. Owners: Mohammad / Osama.
- Context: Parents sign in, children do not have their own login, and children's data must never
  cross family boundaries. MongoDB offers no row-level security (ADR-0003).
- Decisions:
  - **Own accounts with email and password.** `POST /api/v1/auth/register` creates a parent and
    their family. `POST /api/v1/auth/login` checks the password (bcrypt) and returns a JWT
    (HS256, signed with `JWT_SECRET`, valid for `JWT_EXPIRES_IN`, default 7 days). A wrong email
    and a wrong password get the same answer.
  - **Registration is for parents only.** The role is fixed to `parent` on the server. Staff
    accounts are not created through the API yet.
  - **Every request is checked on the server.** `authenticate` reads the bearer token and loads the
    user on every request, so a suspended user is refused at once. `authorize(...roles)` allows only
    the listed roles; a refusal returns 403 and writes an `access.denied` audit event.
    `loadFamily` gives parent routes the parent's active family.
  - **Roles:** `child`, `parent`, `teacher`, `content_admin`, `reviewer`, `platform_admin`,
    `analytics_support` (`apps/api/src/constants/index.js`). Who may do what is in
    `apps/api/docs/authorization-matrix.md`.
  - **Family isolation.** A child is always looked up with the family from the server
    (`Child.findOwned(childId, familyId)`). Another family's child gets 404, the same answer as
    "missing". Records linked to a child check that the child belongs to that family
    (`utils/assertChildInFamily.js`).
  - **Audit.** Consent changes, content publishing and denied access write append-only audit events
    (ids only). Consent and publishing write the event in the same transaction as the change.
- Not built yet: teacher routes, staff MFA, a child PIN or child mode, refresh tokens and token
  revocation (`apps/api/docs/authorization-review.md`, F12).
- Open questions: teacher assignment workflow and admin tooling, account deletion and export,
  a user who is both parent and teacher, whether staff need an outside identity provider with MFA.
