# Security release gates

Every row must be **Done** before production holds real family data. Compare this list with
Section 13.3 of the architecture document and add any gate that is missing.

Status: **Done** = enforced automatically. **Manual** = a person checks and signs below.
**Open** = blocked on a decision or a service that does not exist yet. **N/A** = nothing to protect yet.

| #   | Gate                                                                                                                                                             | How it is verified                                                                                                  | Status                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | One family can never read, list or change another family's child                                                                                                 | `children.repository.int.test.ts`, `api.int.test.ts` (required check: API integration tests)                        | Done                                      |
| 2   | An unassigned or revoked teacher sees nothing                                                                                                                    | Same integration tests                                                                                              | Done                                      |
| 3   | Anonymous requests get 401, a wrong role gets 403                                                                                                                | `app.test.ts`, `middleware.test.ts`, `api.int.test.ts`                                                              | Done                                      |
| 4   | Staff cannot use the API without MFA                                                                                                                             | Tests prove the check. The chosen identity provider must emit the MFA claim (`amr`), see `apps/api/src/auth/mfa.ts` | Open until an identity provider is chosen |
| 5   | No known high or critical dependency vulnerabilities                                                                                                             | `Dependency audit` (required check)                                                                                 | Done                                      |
| 6   | No secrets in the repository                                                                                                                                     | `Secret scan`, GitHub push protection                                                                               | Done                                      |
| 7   | Code scanning shows no high-severity findings                                                                                                                    | `CodeQL analysis`                                                                                                   | Done                                      |
| 8   | Production refuses an unsafe configuration (local database, no TLS, no identity provider, debug logs)                                                            | `env.test.ts`, `Container build` check                                                                              | Done                                      |
| 9   | The container runs as non-root and contains no `.env` file                                                                                                       | `apps/api/Dockerfile`, `.dockerignore`                                                                              | Done                                      |
| 10  | Sensitive actions create audit events                                                                                                                            | Child creation is tested. PIN events are checked in the manual drill                                                | Manual                                    |
| 11  | No child personal data in logs or URLs                                                                                                                           | Manual check A below                                                                                                | Manual                                    |
| 12  | A backup can be restored                                                                                                                                         | Manual drill B below, then repeat on the real production database                                                   | Manual                                    |
| 13  | No publicly readable storage                                                                                                                                     | Nothing is stored yet. Becomes a gate when audio storage is added                                                   | N/A                                       |
| 14  | Every user, children included, sees the QML AI notice before first use of recitation checking, and can reach it afterwards                                       | Manual check C below. Licence: `quran-muaalem` QML 1.0 §2.1 (`docs/ai/genai_and_safety_boundaries.en.md` §3)        | Open until the notice screen exists       |
| 15  | No advertisements, ad code, ad attribution or ad tracking anywhere in the product                                                                                | Manual check D below. QML 1.0 §2.3(a)                                                                               | Manual                                    |
| 16  | If any fee is charged: automatic free access in World Bank low and lower-middle income economies, and a self-declaration path for anyone, visible before payment | QML 1.0 §2.3(b). Becomes a gate when payments are added (out of the prototype, A-005)                               | N/A                                       |
| 17  | Every copy of the AI service given to others (for example a container image) carries the QML `LICENSE` in full and its `NOTICE`                                  | QML 1.0 §2.4, Apache-2.0 §4. The pilot runs on our own machine, nothing is given out yet                            | N/A                                       |
| 18  | Use of recitation checking follows the rulings of Islamic Sharia                                                                                                 | Sign-off by the qualified religious reviewer (O-04). QML 1.0 §2.2                                                   | Manual                                    |
| 19  | A licence breach is fixed within 30 days of notice or of becoming aware of it                                                                                    | Owner named in the risk register. QML 1.0 §2.5: otherwise the licence ends automatically                            | Manual                                    |

## Manual check A: no child data in logs

1. Start the API: `pnpm --filter @noor/api start:local *> api.log`
2. In another window, create a child with the display name `Zzqx-Test`, then stop the API (Ctrl+C).
3. Run `Select-String -Path api.log -Pattern "Zzqx-Test"`. It must find nothing.
4. Delete `api.log`. Do not commit it.

## Manual drill B: backup and restore

With local test data present:

```powershell
docker exec noor-mongo mongosh --quiet --eval "db.getSiblingDB('noor_local').audit_events.countDocuments()"
docker exec noor-mongo mongodump --db noor_local --archive=/tmp/noor.archive
docker exec noor-mongo mongosh --quiet --eval "db.getSiblingDB('noor_local').dropDatabase()"
docker exec noor-mongo mongorestore --archive=/tmp/noor.archive --nsInclude="noor_local.*"
docker exec noor-mongo mongosh --quiet --eval "db.getSiblingDB('noor_local').audit_events.countDocuments()"
```

The first and last counts must match.

**Production note:** MongoDB Atlas free clusters have no automated backups and run on shared
hardware. Real family data needs a paid tier with backups. Repeat this drill against a restored
production snapshot before launch.

## Manual check C: the AI notice (gate 14)

QML 1.0 §2.1 binds the product that shows the recitation checker (the "Interface Provider"), not
only the AI service. Check on a fresh account, in every interface language:

1. Before the first recitation check, the notice is shown to the user who records, including in the
   child area. It is not skipped by a parent having seen it.
2. The text is the licensor's official text word for word (below), or keeps all four elements:
   (1) an AI model that may make mistakes, (2) for assistance only and must not be relied upon,
   (3) not a replacement for a proficient, authorized teacher, (4) the Quran is received only through
   oral transmission (mushafahah).
3. It is shown in Arabic, and also in each other interface language. If versions differ, the Arabic
   text controls.
4. Afterwards it is reachable from the main menu or the About or Help screen.
5. It is at least as prominent as the product's other legal or About information, and no smaller
   than body text.
6. Nowhere does the product present the checker or its results as a substitute for a teacher.

Official text (QML 1.0 §2.1(b), also in the package's `NOTICE` file):

- **AR:** هذا المعلّم القرآني نموذج ذكاء اصطناعي قد يخطئ؛ فهو للإعانة فقط ولا يُعتمد عليه، وليس بديلاً
  عن معلّمٍ مُتقِنٍ مُجاز؛ لأنّ القرآن لا يُؤخذ إلا بالمشافهة.
- **EN:** This Quranic Teacher is an artificial-intelligence model that may make mistakes. It is
  intended for assistance only and must not be relied upon. It is not a replacement for a
  proficient, authorized teacher, because the Quran is only received through oral transmission
  (mushafahah).

## Manual check D: no advertisements (gate 15)

QML 1.0 §2.3(a) applies whether or not the product is commercial. General analytics and crash
reporting are allowed only if they are not used for advertising.

1. List the web app's and the API's production dependencies (`pnpm --filter @noor/web list --prod`,
   `pnpm --filter @noor/api list --prod`) and the scripts the built web app loads. None may serve
   ads, measure ad conversions, or track users across apps or sites.
2. Open the built app with the browser's network panel: no request goes to an advertising or
   ad-attribution domain.
3. No screen shows content paid for by a third party. Naming donors or sponsors without
   promotional content is allowed.

## Sign-off

| Gate | Checked by | Date | Notes |
| ---- | ---------- | ---- | ----- |
| 4    |            |      |       |
| 10   |            |      |       |
| 11   |            |      |       |
| 12   |            |      |       |
| 14   |            |      |       |
| 15   |            |      |       |
| 18   |            |      |       |
| 19   |            |      |       |
