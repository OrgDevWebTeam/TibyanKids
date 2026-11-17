# Secrets Handling (SEC-004)

Last updated: 2026-11-17

## Purpose

This file explains where secrets live, how they are kept out of source control, and what to do if one is exposed.

## Where secrets live

- Secrets live only in `apps/api/.env` on each developer's or server's machine.
- `.env` and `.env.*` are listed in `.gitignore`, so they are never committed.
- `apps/api/.env.example` shows the variable names with placeholder values only. It is the only env file that is committed.

## Current secrets

| Name                | What it is                                                                             | Where it is used    |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------- |
| `DATABASE_PASSWORD` | Password of the MongoDB Atlas database user                                            | `src/config/env.js` |
| `JWT_SECRET`        | Key used to sign login tokens. Anyone who has it can create a valid token for any user | `src/config/env.js` |

Non-secret settings are kept in the same file for convenience: `NODE_ENV`, `PORT`, `CLIENT_ORIGIN`, `JWT_EXPIRES_IN`, `AI_SERVICE_URL`, `AI_TIMEOUT_MS`, `AUTH_RATE_LIMIT` (register and login requests per IP per 15 minutes, default 20), and the `DATABASE` connection string with the `<PASSWORD>` placeholder.

Future secrets (for example the key of an email service) must be added to `.env.example` as names only, and listed in the table above.

## JWT_SECRET rules

- It must be at least 32 characters. The server refuses to start otherwise.
- Generate it randomly, for example: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- Use a different value in development, staging and production.
- The placeholder in `.env.example` is deliberately too short, so a copied example file cannot start the server with a known secret.

## Separate environments (OPS-001)

- Development, staging and production each use their own values and their own database.
- `NODE_ENV` selects the environment. It must be `development`, `staging` or `production`.
- `src/config/env.js` checks the configuration when the server starts. If a variable is missing or invalid, the server prints what is wrong and exits. It never starts with a bad configuration.
- The password is URL-encoded before it is placed in the connection string, so special characters do not break the connection.
- Outside development, `src/config/envRules.js` also refuses a database connection that is not encrypted or is local (see the next section).

## Encryption of sensitive data (SEC-003)

### In transit

- **Database.** The server connects to MongoDB Atlas over TLS. In staging and production the server refuses to start unless `DATABASE` uses `mongodb+srv://` (TLS is on by default) or `tls=true`, TLS is not turned off (`tls=false`, `ssl=false`), and the host is not local. The rule is in `src/config/envRules.js` and tested in `tests/config/envRules.test.js`. Development is not restricted, so a local database still works on a laptop.
- **API.** HTTPS is provided by the hosting platform in front of the container. No host is chosen yet (see `docs/DEPLOYMENT.md`), so this is not verified. The hosting decision must allow HTTPS only. The server already sends the HSTS header (through `helmet`).
- **AI service.** It is internal and never exposed to browsers. On a laptop it is reached over plain HTTP on localhost. For staging and production the connection must stay on a private network or use TLS. This is not decided yet (open question below).

### At rest

- **Passwords** are stored only as bcrypt hashes and are never returned by a query (`select: false`).
- **Email verification tokens** are stored only as SHA-256 hashes, with an expiry.
- **Audio** is not stored by the API. It is sent to the AI service and dropped.
- **Database storage.** Encryption at rest is a property of the MongoDB Atlas cluster (ADR-0003). It cannot be checked from the code, so it must be confirmed for the chosen Atlas tier and recorded here.

### Open questions

1. Which Atlas tier is used for staging and production, and is encryption at rest confirmed for it?
2. Which host serves the API, and does it enforce HTTPS only?
3. How is the connection to the AI service protected in staging and production (private network or TLS)?

## Rotation

If a secret is shared by mistake (chat, screenshot, commit, log):

1. Replace it: for the database password, change it in MongoDB Atlas (Database Access, edit the user's password). For `JWT_SECRET`, generate a new random value.
2. Update `apps/api/.env` on every machine that uses it.
3. Tell the team.
4. If it was committed to git, treat it as exposed even after the file is deleted, because it stays in the git history.

Rotating `JWT_SECRET` logs everyone out, because old tokens stop being valid.

Owner of rotation: Mohammad (Team Leader)

Secrets should also be rotated when a team member who knew them leaves the project.

## Logs

- Never log secrets, tokens, passwords or full request bodies.
- One development-only exception: with no email provider yet, the placeholder mailer (`src/utils/mailer.js`) prints the email verification link to the console when `NODE_ENV` is `development`. Tests turn it off with `MAIL_LOG=off`. In staging and production the mailer refuses to run and never logs the token. The token is also single-use and expires after 24 hours.
- Audit entries only accept `meta` keys from `ALLOWED_META_KEYS`, and only short text values, for this reason (see `docs/authorization-review.md`).

## Checks before every commit

- Run `git status` and confirm `.env` is not listed.
- Never paste real values into code, tests, docs or pull requests.
