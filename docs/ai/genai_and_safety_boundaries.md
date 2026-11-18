# GenAI and Safety Boundaries

- **Project:** Tibyan Kids
- **Authors:** Ismail (AI 2) & Qussai (AI 1)
- **Version:** v1.3 (aligned with CRS v3.0 and Architecture v3.0; adds personalization and
  recommendation boundaries). Jira: KAN-11

> 🔶 = proposal waiting for a decision. Everything else follows CRS v3.0 and Architecture v3.0.

---

## 1. Strict model boundaries

1. **No language models in the child's path.**
   - In the prototype, no text-generating model (GPT or any open LLM) is used to explain verses,
     give rulings, or chat with the child (C-02, AP-11, ADR-012, CRS §3.2 out of scope).
   - Architecture v3.0 §8.2: later, and only outside the child's path, a small local model may
     reword parent summaries **without adding any new fact**. Not in the prototype; needs a new
     decision (section 2.6).
   - Everything the agent says to a child is pre-recorded and comes from the approved message
     keys (`safe_messages_v1_1.json`).

2. **AI only scores audio** (AP-11), in three roles, each with one local model (Architecture §3,
   §8.2):
   1. **Quran recitation: sounds and tajweed** for the 25 ayahs of the 5 surahs, with
      `quran-muaalem`, always against the expected ayah (Python interface), never by searching the
      whole Quran.
   2. **Quran recitation: word comparison** (skipped, changed or extra words, `ERR_MEM_*`) with
      `whisper-quran` (`tarteel-ai/whisper-base-ar-quran`). When it disagrees with muaalem the
      finding is `ERR_TECH_MODELS_DISAGREE` and the result is `uncertain`.
   3. **Spoken Arabic words** in the Arabic track (FR-ARB-002) with **faster-whisper and an open
      Whisper model** (size decided in OD-03). Not the same model as `whisper-quran`.
   - **Hard rule:** Whisper transcripts are **never shown to a child** and never leave the AI
     service, so a transcription hallucination can never reach a child. The child only sees the
     text for a `messageKey` (contract: `docs/contracts/ai-result.md`).
   - AI does not score isolated letter pronunciation (D-017, FR-ARB-001).

3. **A model result is always preliminary** (AP-04, NFR-AI-001).
   - It is preliminary evidence, saved with model name, version and confidence (OPS-008). A
     teacher decision always overrides the model (Architecture §7.2).
   - Any result below the confidence threshold becomes `uncertain` and goes to the teacher; the
     child moves on and is never stuck (FR-QUR-006).

4. **Kill switches.** One setting per model (Architecture §8.5, §8.7). When a model is off, the
   session continues as listen-and-record and every ayah goes to the teacher's notes. The app and
   the child's session never stop.

5. **Everything stays local** (AP-06, SEC-011, NFR-LOCAL-001). Child audio and data never leave our
   machines, are never sent to an outside service, and are never pasted into an AI tool used for
   development (SEC-018).

---

## 2. Personalization and recommendation boundaries

Personalization in Tibyan is **fixed rules that can be explained**: no black box and no generative
model (AP-11, Architecture §5 and §8.2).

### 2.1 Who decides the child's plan?

- The **daily planner** is plain JavaScript rules over the learner profile (Architecture §5.2):
  continue Quran from the last ayah, resume an incomplete session first, review ayahs with errors
  at the start of each week, take the next Arabic item in the child's stage.
- 🔶 Every plan item stores **why it was chosen** (the rule name), so teachers and parents can see
  the reason.
- The plan does not change because the child asks (C-02, CRS §5.2).

### 2.2 Data allowed for personalization

| Allowed (from inside Tibyan only)                  | Not allowed                                                                  |
| :------------------------------------------------- | :--------------------------------------------------------------------------- |
| Placement test result                              | Inferring fixed traits or personality (AP-05)                                |
| Learner profile: level, last ayah, repeated errors | Profiles for advertising or ad tracking (SEC-009)                            |
| Asia & Sham question answers                       | Data from outside the platform                                               |
| Teacher decisions                                  | The model's result alone to decide mastery                                   |
| Parent observation (context, never a diagnosis)    | Child audio for anything but analysis, unless separately consented (SEC-017) |

### 2.3 Behavioral missions (Family Loop)

- A mission is picked from a **fixed, reviewed table** that links a value to a mission: a wrong
  answer about a value in an Asia & Sham story picks the mission for that value (FR-AGT-004). No
  generated missions.
- Prototype: the mission is chosen by rules only. No AI model is used to pick a mission.
- Parents answer with three options only (VAL-004), and **one observation never proves a value is
  mastered** (FR-FAM-004, VAL-005).
- The system never judges the child's behavior at home; the parent is the source (CRS §5.2,
  D-014).

### 2.4 Levels and mastery

- **No automatic demotion:** levels never go down automatically (FR-AGT-006).
- Levels go up after a set number of successful sessions; Quran level-ups need **teacher
  confirmation**.
- AI alone never marks a child as having mastered a rule or skill (CRS §5.2, Architecture §8.7).

### 2.5 Parent reports

- The **daily summary** is a 3-line template with **facts only**, no analysis (FR-PAR-004,
  VAL-015).
- The **weekly insight** is a template too. It draws no behavioral conclusion from thin evidence
  (VAL-011) and shows an evidence caveat (SCR-P04).
- The Growth Map separates "not assessed" from "needs support" (CRS §11.1). No labels, no shaming.

### 2.6 What may come later (not in the prototype)

| Idea                                          | Condition before starting                                                                                                       |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| Rewording parent summaries with a local model | New architecture decision (ADR-009); no new facts; output checked automatically against the source facts; never reaches a child |
| A recommender instead of rules                | Enough data to justify it (Architecture §8.2) and a new architecture decision; must stay explainable                            |

### 2.7 Rewards

Limited XP, badges and streaks tied to effort and growth, **no manipulative loops**
(FR-GAM-001/002).

---

## 3. Model licences and the AI notice

> **Status: ✅ approved.** Mohammad approved the model and library licences on 2026-11-05.
> Recorded in the OPS-009 register: `docs/ai/model-register.md`. Remaining: show the AI notice in the app.

### 3.1 Remaining steps

1. Pin the package version and model revision (`obadx/muaalem-model-v3_2` and the others) and
   send it in `modelVersion` with every result (OPS-008). Owner: Qussai.
2. Record every model, library and reference recitation with its licence in the OPS-009 register
   (done: `docs/ai/model-register.md`), and update the component table in the Architecture (to do:
   quran-muaalem's package is QML 1.0, its model weights are MIT). Owner: Ismail.

### 3.2 Conditions of QML 1.0 (checked against the `LICENSE` file, 2026-11-15)

QML 1.0 is the Apache License 2.0 plus additional conditions (§2 of the licence). They bind the
product that shows the checker to users, not only the AI service. Each one is a release gate in
`docs/SECURITY-GATES.md` (gates 14–19).

| Condition (QML 1.0 section)                                                                                                                                                                 | Effect on Tibyan                                                                                                        |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| §2.1 AI notice: shown to **every** end user before first use and always reachable afterwards (main menu, About or Help), in Arabic and each interface language, no smaller than body text   | Needed in the app, **including the child area**: the children are the users who record (section 3.3). Gate 14           |
| §2.1(f) Never present the checker or its results as a substitute for a proficient, authorized teacher                                                                                       | Applies to all product and marketing text                                                                               |
| §2.2 Follow the rulings of Islamic Sharia in every use, change and distribution                                                                                                             | Review by the qualified religious reviewer (O-04). Gate 18                                                              |
| §2.3(a) No advertisements, ad code, ad attribution, cross-app ad tracking, or selling user data for ads, whether or not the product is commercial                                           | Matches SEC-009. Analytics and crash reports are allowed if not used for ads. Gate 15                                   |
| §2.3(b) If any fee is charged: automatic free access in World Bank "Low income" and "Lower-middle income" economies, and a no-cost self-declaration path for anyone, visible before payment | A product decision for the family membership (BR-004), not a detail. Payments are out of the prototype (A-005). Gate 16 |
| §2.4 Every copy given to others carries the licence in full                                                                                                                                 | Only if the AI service is given out (for example an image). Gate 17                                                     |
| §2.5 A breach not fixed within 30 days ends the licence automatically                                                                                                                       | Owner in the risk register. Gate 19                                                                                     |

### 3.3 AI notice text

Use the licensor's official text **word for word**: QML 1.0 §2.1(b) says this satisfies the
licence, and the Arabic text controls. The earlier draft did not: it left out "must not be relied
upon" and, in Arabic, "only" (لا يُؤخذ **إلا** بالمشافهة).

- **Arabic:** هذا المعلّم القرآني نموذج ذكاء اصطناعي قد يخطئ؛ فهو للإعانة فقط ولا يُعتمد عليه، وليس
  بديلاً عن معلّمٍ مُتقِنٍ مُجاز؛ لأنّ القرآن لا يُؤخذ إلا بالمشافهة.
- **English:** This Quranic Teacher is an artificial-intelligence model that may make mistakes. It is
  intended for assistance only and must not be relied upon. It is not a replacement for a
  proficient, authorized teacher, because the Quran is only received through oral transmission
  (mushafahah).

The licence also allows "This tool" instead of "This Quranic Teacher" only where the product is not
a teacher (for example a search-only tool). Tibyan's checker corrects recitation, so keep "This
Quranic Teacher".

**Who sees it.** Every user who records, the child included, before the first recitation check;
and everyone can reach it later from the main menu or Help. A parent seeing it does not cover the
child. How it reaches a child who cannot read yet (for example read aloud, with the text on screen)
is decided by Ola and Mohammad. Osama builds it.

Proposed key: `NOTICE_AI_MAY_ERR`, in the app's interface messages (not `safe_messages_v1_1.json`).
