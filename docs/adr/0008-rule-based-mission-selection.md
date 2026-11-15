# ADR-0008: Rule-based mission selection with age-band adaptation

- Status: Proposed (owner: Qussai; to accept with Mohammad and Ahmad). Jira: KAN-34.
- Replaces: ADR-0007 "Mission selection guardrails" (removed in #39), which kept missions in the AI
  service with an optional language-model selector.
- Context: The Family Loop gives the child a real-life mission (Learn → Practice → Parent Observe →
  Reflect → Adapt). Missions must come from a fixed, reviewed table and be chosen by rules only
  (safety doc §2.3, FR-AGT-004); no language model is in the child's path (AP-11, ADR-012); the
  learning plan comes from rules (AI Requirements, "Learning"). Selection must suit the child's age
  band (6–8, 9–11, 12–14) and what the Growth Graph says the child needs. The roadmap places this
  in weeks 3 (rule-based mission logic), 4 (rule-based personalization) and 6 (age-aware logic).
- Decisions:
  - **Rules only, in the API.** A pure function in `apps/api/src/missions/` chooses. No model and no
    call to the AI service: the API already holds the child, the content and the evidence. The same
    inputs always give the same mission.
  - **Missions are content.** A mission is a `Content` item with `type: "mission"`. It goes through
    the existing workflow (draft → review → approval by someone else → published) and, like a Quran
    task, **always needs review**. Only `published` missions can be chosen. Its wording is its
    reviewed title and description; nothing is generated.
  - **Explainable.** Every choice carries a `reasonRule`, stored with the plan item, so a parent or
    teacher can see why this mission was given (safety doc §2.1).
  - **No personal data in or out.** The function gets an age band, levels, competency codes and
    statuses, content ids and recent mission ids. Never a name, a date of birth or free text.
- Contract: §1–§4 below. Code: `selectMission()` (KAN-34, next pull request).
- Open questions: in §5.

## 1. Inputs and output

| Input                        | What it is                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ageBand`                    | The child's age band, `6-8`, `9-11` or `12-14` (from the date of birth, as the Child model computes it)                                                |
| `levels`                     | The child's level per domain where one exists: `quran` (from `quranLevel`) and `arabic` (from `arabicLevel`), 0–5                                      |
| `competencyStatus`           | Status per competency code: `not_assessed`, `practising`, `needs_practice` or `achieved`, from the Growth Graph (KAN-37). Missing means `not_assessed` |
| `missions`                   | The published missions: id, age band, domain, level (1–5), estimated minutes, competency codes                                                         |
| `recentMissionIds`           | Missions given recently, newest first                                                                                                                  |
| `domain` (optional)          | Only missions of this domain, for example for a domain's slot in the day                                                                               |
| `focusCompetency` (optional) | The competency to work on now, for example the value a child answered wrongly in an Asia & Sham story (FR-AGT-004)                                     |

Output: `contentId` (or `null`), `reasonRule`, `competencyCode` (the competency behind the choice, or
`null`) and `rulesVersion`.

## 2. Age-band adaptation

A mission is written and reviewed for one age band, and only children of that band get it. 🔶 The
values are a proposal for Ola (child UX) and Mohammad.

| Age band | Missions of band | Longest mission | Who leads (for the screens)                             |
| -------- | ---------------- | --------------- | ------------------------------------------------------- |
| 6–8      | `6-8` only       | 10 minutes      | The parent reads the mission and does it with the child |
| 9–11     | `9-11` only      | 15 minutes      | The child does it; the parent observes                  |
| 12–14    | `12-14` only     | 20 minutes      | The child does it; the parent observes                  |

There is no fallback to another band: a mission not reviewed for the child's age is never given.
If none fits, the answer is `RULE_NO_MISSION`.

## 3. The rules, in order

1. **Filter.** Keep a mission only if it is for the child's age band, takes no longer than the
   band's limit, is in `domain` (when given), and fits the child's level:
   - in a domain where the child has a level `L` (`quran`, `arabic`): mission level from `max(1, L)`
     to `min(5, L + 1)`, so the child works at their level or one above;
   - in other domains: any level (lower levels come first, step 2).
2. **Rank.** Each mission takes the most urgent status among its competencies, in this order:

   | Rank | Mission has…                                  | `reasonRule`          |
   | ---- | --------------------------------------------- | --------------------- |
   | 1    | the `focusCompetency`                         | `RULE_FOCUS`          |
   | 2    | a competency that `needs_practice`            | `RULE_NEEDS_PRACTICE` |
   | 3    | a competency `not_assessed`                   | `RULE_NOT_ASSESSED`   |
   | 4    | a competency being `practising`               | `RULE_PRACTISING`     |
   | 5    | only `achieved` competencies (or none at all) | `RULE_ALL_ACHIEVED`   |

   Ties: lower level first, then shorter, then by content id, so the order never changes between
   runs.

3. **No repeats.** Take the best-ranked mission that is not in `recentMissionIds`. If every mission
   left was given recently, give the one given longest ago, with `RULE_REPEAT`. If no mission is
   left after step 1, answer `RULE_NO_MISSION` with `contentId: null`.

`competencyCode` is the competency that gave the mission its rank (for rank 5, `null`).

## 4. What the rules never do

- Choose a mission that is not `published` (so not reviewed and approved), or of another age band.
- Write or change any text.
- Use a model, a random choice or the time of day.
- Mark anything as achieved: missions only read the Growth Graph. A parent's observation is
  evidence, and one observation never proves a value (FR-FAM-004, VAL-005).

## 5. Open questions

| #   | Question                                                                                       | Who                |
| --- | ---------------------------------------------------------------------------------------------- | ------------------ |
| 1   | Accept this ADR: rules in the API, missions as content                                         | Mohammad, Ahmad    |
| 2   | The age-band values in §2                                                                      | Ola, Mohammad      |
| 3   | How many missions a day, and which domains get a slot in the Today plan                        | Mohammad           |
| 4   | Where `competencyStatus` comes from (the Growth Graph, KAN-37); until then, all `not_assessed` | Ismail, Ahmad      |
| 5   | The real missions: writing them, and the values and religious review of each one               | Content team, O-04 |
| 6   | The endpoint that serves today's mission (roadmap week 4, "mission APIs")                      | Ahmad              |
