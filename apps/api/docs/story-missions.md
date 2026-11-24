# Story Missions (FR-STORY-001, FR-STORY-002, FR-FAM-001, API-006)

Date: 2026-11-24
Status: working. A content admin links a story to its family mission in a package and publishes it once it is complete. A child who finishes the story receives that mission.

## What it is

Before this, finishing a story gave the family a mission picked by a rule that looks at the child's growth. Nothing said "this story goes with that mission". A **story mission package** adds that link, plus what the story teaches: its learning outcomes, its vocabulary and a decision challenge. It is the CRS "StoryMission" entity.

| CRS requirement | What it says                                                                                                  | Where it is built                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| FR-STORY-001    | A Content Admin converts a story into a mission package. It cannot publish without its mappings and approvals | `StoryMission`, `packageProblems`, `saveDraftPackage`, `publishPackage`                                 |
| FR-STORY-002    | A child finishes a story and receives a real-life mission in one journey                                      | `POST /children/:id/stories/:storyId/complete` (the challenge is not recorded yet, see below)           |
| FR-FAM-001      | A lesson or story can assign a family mission linked to a competency                                          | `assignLinkedMission` in `missionService.js`, with the rules of `selectMission` as the fallback         |
| API-006         | `/content` and `/stories/{id}/mission`. Published and age-eligible only for the child                         | `GET /stories/:id/mission`, `GET /content?childId=` and `GET /content/:id?childId=`, `eligibleForChild` |

## The package

One `StoryMission` record per story.

| Field                                     | What it holds                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `storyId`                                 | The story (a `Content` of type `story`). It never changes. One package per story                       |
| `missionId`                               | The mission the child gets (a `Content` of type `mission`). It can change while the package is a draft |
| `outcomes`                                | What the child should understand afterwards, one short sentence each (at most 10, 200 characters each) |
| `vocabulary`                              | Words the story teaches: a `word` and a `meaning` (at most 30, each word once)                         |
| `challenge`                               | A question (`prompt`) with two to four choices (`options`). **No correct answer is stored**            |
| `status`                                  | `draft`, `published` or `archived`                                                                     |
| `createdBy`, `publishedBy`, `publishedAt` | Who made it, who published it, and when                                                                |

The story asset in the CRS is the story `Content` itself, so it has no field of its own. One mission can serve several stories.

## The rules

All of them are in `src/missions/contentLinking.js`, as plain functions without a database. The CRS gives no numbers, so these are the project's chosen starting rules.

**A package may be published only if `packageProblems` finds nothing wrong:**

| Rule                                                                                                                    | Message when it fails                        |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| The story exists, is of type `story` and is published                                                                   | "The story must be published" (and similar)  |
| The mission exists, is of type `mission` and is published (a published mission has already been approved by a reviewer) | "The mission must be published and approved" |
| Same age band                                                                                                           | "They must be for the same age band"         |
| Same language                                                                                                           | "They must be in the same language"          |
| At least one competency in common                                                                                       | "They must share at least one competency"    |
| At least one learning outcome with real text                                                                            | "Add at least one learning outcome"          |

It returns **all** the problems at once, so the admin can fix them in one go.

**Content is suitable for a child (`eligibleForChild`)** when it is published and its age band is the child's age band. The language is not checked: a child may learn Arabic content with another home language.

## How it works

**For the content team**

1. The admin saves the package as a draft (`PUT`). Saving again replaces the draft, and anything left out is cleared. The story may still be a draft at this point.
2. When the story and the mission are published and approved, the admin publishes the package (`PATCH .../publish`). If anything is missing, nothing changes and the answer lists the problems.
3. A published package cannot be edited or published again.

**For the family**

1. The parent says the child finished a story (`POST /children/:id/stories/:storyId/complete`). The story is saved as the child's progress, with no score.
2. The hook on `Progress` records the growth evidence, then asks for a mission (FR-FAM-001):
   - A story with a **published package** gives the mission the package links to, with the reason `RULE_STORY_LINK`.
   - Anything else, or a link that cannot be used, gets the mission that `selectMission` chooses, exactly as before.
3. A link cannot be used when the mission is no longer published, no longer suits the child, the child already has that mission open, or the child already has the most open missions.
4. The mission appears in `GET /children/:id/missions`, and the parent observes it as described in `family-loop.md`.

## The endpoints

| Endpoint                                              | Who                                                                      | What it does                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `PUT /api/v1/stories/:id/mission`                     | Content admin, platform admin                                            | Creates the draft (201) or replaces it (200)                                              |
| `PATCH /api/v1/stories/:id/mission/publish`           | Content admin, platform admin                                            | Publishes the package, or answers 409 with the list of problems                           |
| `GET /api/v1/stories/:id/mission`                     | A parent (with `?childId=`), and content admin, reviewer, platform admin | A parent gets the mission for that child. The content team gets the package in any status |
| `POST /api/v1/children/:id/stories/:storyId/complete` | A parent, for their own child                                            | Completes the story, and returns the mission that came with it                            |

### Save a package: `PUT /api/v1/stories/:id/mission`

```json
{
  "missionId": "...",
  "outcomes": ["The child can explain why telling the truth matters"],
  "vocabulary": [{ "word": "truthful", "meaning": "someone who says what is real" }],
  "challenge": {
    "prompt": "Your friend broke the cup. What do you do?",
    "options": [{ "text": "Say it was me" }, { "text": "Say nothing" }]
  }
}
```

Only `missionId` is required. Any other field, such as `status`, `createdBy` or `storyId`, is refused with 400, and so is a correct-answer flag on the challenge. The story comes from the URL and the author from the login.

### Publish: `PATCH /api/v1/stories/:id/mission/publish`

When the package is not ready:

```json
{
  "status": "fail",
  "message": "The package cannot be published yet",
  "problems": ["The story must be published", "Add at least one learning outcome"]
}
```

### The mission of a story: `GET /api/v1/stories/:id/mission?childId=...`

A parent must say which child it is for. The child decides the age band. The answer is the story, the mission, the outcomes, the vocabulary and the challenge (the question and the choices). It never contains the author, the status or any dates. It is a 404 when there is no published package, or the child's age band does not suit it, with the same answer for both.

### Complete a story: `POST /api/v1/children/:id/stories/:storyId/complete`

No body. The first call answers 201, and repeating it answers 200 with the same result and changes nothing.

```json
{
  "status": "success",
  "created": true,
  "progress": { "id": "...", "storyId": "...", "status": "completed", "completedAt": "..." },
  "mission": {
    "assignmentId": "...",
    "expiresAt": "...",
    "reasonRule": "RULE_STORY_LINK",
    "mission": {
      "id": "...",
      "title": "...",
      "description": "...",
      "estimatedMinutes": 8,
      "domain": "character",
      "level": 3
    }
  }
}
```

`mission` is `null` when no mission could be given, for example when the child already has the most open missions.

### Content for a child: `GET /api/v1/content?childId=...`

The content list was already limited to published content for a parent, but it showed every age band. A parent can now add `?childId=` (a child of their own family) to the list, or to one item (`GET /api/v1/content/:id?childId=...`), and then only gets content of **that child's age band**.

- Without `childId`, nothing changes.
- It combines with the other filters and with paging. Asking for another `ageBand` as well gives an empty list.
- For one item, content of another age band, or content that is not published, is a 404, the same as content that does not exist.
- Another family's child is a 404 and is written to the audit log. A bad id is a 400.
- The content team cannot use it (400). They filter with `ageBand`, and they see every status.

### Errors

| Status | When                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid input: an extra field, a bad id, a challenge with the wrong number of options, a score in the completion body, a parent without `?childId=` |
| 401    | Not signed in                                                                                                                                       |
| 403    | The wrong role, or (for completion) the child has no active consent                                                                                 |
| 404    | The story, the package or the child does not exist, or belongs to another family, or the story does not suit the child                              |
| 409    | The package is not ready (with the list), is already published, is archived, or already exists                                                      |

## Security and privacy

- **Family scoping (SEC-002).** A parent reaches a story's mission or completes a story only for a child of their own family. Another family's child gives 404 and is written to the audit log as `access.denied`.
- **No score from a client.** Completing a story takes an empty body. Only taking part is proven, so a parent cannot raise the Growth Map by sending a high score.
- **No answers to leak.** The challenge stores a question and choices, never a correct answer, so a child's app cannot read one.
- **Consent.** Completing a story needs a child with active consent, like a recording. Reading a mission needs none, because a mission is content and not child data.
- **Audit (SEC-007).** Creating, replacing and publishing a package each write a `content.created`, `content.updated` or `content.published` event with the target type `StoryMission`, in the same transaction as the change.
- **Nothing half-saved.** If the audit event cannot be written, the package is not published.
- **Never blocks the child.** If linking fails, the child's progress is still saved and the failure is logged with ids only.

## Decisions to confirm with the PM

1. A story links to **one** mission.
2. The package needs **no separate reviewer approval**: the story and the mission are already approved through the content workflow, and the package may be published only when both are published.
3. **A published package cannot be edited.** Changing a live package would need versions or an archive step.
4. A completed story carries **no score**, so it counts as "partly met" evidence. Should it count for more?
5. The **language** is not part of "suitable for a child".
6. **Reading a mission needs no consent**, completing a story does.
7. Outcomes are plain text. They are not linked to competencies.

## Where it differs from the CRS

- **The challenge is stored, not answered.** FR-STORY-002 says the child answers a decision challenge. The package stores the question and its choices, but nothing records a child's answer yet.
- **Who completes the story.** The CRS names the Child. No child sign-in exists, so a parent completes the story for the child.
- **FR-STORY-003** (a public story entry point that deep-links into a mission) is not built.

## Files and tests

Files: `src/missions/contentLinking.js`, `src/Models/StoryMission.js`, `src/validations/storyValidation.js`, `src/missions/storyMissionService.js`, `src/controllers/storyController.js`, `src/routes/storyRoutes.js`, `src/utils/findChildInFamily.js`. Changed: `src/missions/missionService.js` (the linked mission and the shared open-missions check), `src/routes/childrenRoutes.js` and `src/app.js` (the new routes), and `src/controllers/contentController.js`, `src/routes/contentRoutes.js` and `src/validations/contentValidation.js` (`?childId=` on the content list).

Tests: `tests/missions/contentLinking.test.js`, `tests/models/storyMission.test.js`, `tests/validations/stories.test.js`, `tests/missions/storyMissionService.test.js`, `tests/api/stories.test.js`, `tests/missions/storyLinkAssign.test.js`, `tests/api/story-completion.test.js`, `tests/api/content-age.test.js`.

## Not built yet

- Recording a child's answer to the decision challenge.
- Editing or versioning a published package, and archiving one through the API.
- A child's own sign-in.
- The public story entry point (FR-STORY-003).
- A mission's instructions and parent prompt (see `data-dictionary.md`).
