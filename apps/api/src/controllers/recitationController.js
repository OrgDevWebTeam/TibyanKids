// POST /api/v1/children/:id/recitation-attempts: one recorded ayah of a child. Owner: Qussai.
//
// Flow:
//   1. The child belongs to this family, is active, and has active consent
//   2. The audio and fields are valid, and the ayah is one of the 25 prototype ayat
//   3. The same clientAttemptId again returns the saved attempt (VAL-010): no second analysis
//   4. The AI service checks the recording (src/ai/aiClient.js)
//   5. Then one of:
//      - unreadable audio, or a quality-gate rejection: the child records again, nothing is saved
//        (not an attempt, VAL-014)
//      - a result, or the fallback "uncertain" result when the AI failed: saved and returned.
//        The child is never stuck because the AI is down or slow (FR-QUR-006)
import mongoose from "mongoose";
import Child from "../Models/Child.js";
import ConsentRecord from "../Models/ConsentRecord.js";
import QuranAttempt from "../Models/QuranAttempt.js";
import { recitationAttemptSchema } from "../validations/recitationValidation.js";

function invalidInput(res, issues) {
  return res.status(400).json({
    status: "fail",
    message: "Invalid input",
    errors: issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  });
}

export async function createRecitationAttempt(req, res) {
  // 1. The child. The same 404 for "missing" and "another family's child"
  const child = await Child.findOwned(req.params.id, req.family._id).where("status").ne("archived");
  if (!child) {
    return res.status(404).json({ status: "fail", message: "Child not found" });
  }
  // A child's voice is highly sensitive: no audio is accepted without active consent
  if (child.status !== "active" || !(await ConsentRecord.hasActiveConsent(child._id))) {
    return res.status(403).json({ status: "fail", message: "Active consent is required" });
  }

  // 2. The fields and the audio
  const fields = recitationAttemptSchema.safeParse(req.body ?? {});
  if (!fields.success) {
    return invalidInput(res, fields.error.issues);
  }
  const file = req.file;
  if (!file || file.size === 0 || !file.mimetype.startsWith("audio/")) {
    return invalidInput(res, [{ path: ["audio"], message: "An audio file is required" }]);
  }
  const { clientAttemptId, surah, ayah, level } = fields.data;

  // 3. A repeated upload of the same recording
  const saved = await QuranAttempt.findOne({ childId: child._id, clientAttemptId });
  if (saved) {
    return res.status(200).json({ status: "success", attempt: saved });
  }

  // 4. The AI service. The attempt's own id is the attemptId it sees: no child or family id
  const attemptId = new mongoose.Types.ObjectId();
  const outcome = await req.app.locals.aiClient.analyzeRecitation({
    attemptId: attemptId.toString(),
    surah,
    ayah,
    level,
    audio: { buffer: file.buffer, mimeType: file.mimetype },
  });

  // 5. Record again: not an attempt, nothing saved
  if (outcome.kind === "record_again") {
    return res.status(422).json({ status: "record_again", reason: outcome.code });
  }
  if (outcome.result.quality !== "ok") {
    return res.status(200).json({ status: "record_again", reason: outcome.result.quality });
  }

  if (outcome.kind === "fallback") {
    // Ids and the reason only: never audio or child data in logs
    console.warn(
      `AI service failed (${outcome.failure}) for attempt ${attemptId}: saved as uncertain`,
    );
  }

  // The result without its attemptId: that is the attempt's own _id
  const { model, modelVersion, decision, quality, findings, processingMs } = outcome.result;
  const result = { model, modelVersion, decision, quality, findings, processingMs };
  try {
    const attempt = await QuranAttempt.create({
      _id: attemptId,
      familyId: req.family._id,
      childId: child._id,
      clientAttemptId,
      surah,
      ayah,
      level,
      result,
      aiFailure: outcome.kind === "fallback" ? outcome.failure : null,
    });
    return res.status(201).json({ status: "success", attempt });
  } catch (error) {
    // The same recording arrived twice at the same time: the first one was saved
    if (error.code === 11000) {
      const first = await QuranAttempt.findOne({ childId: child._id, clientAttemptId });
      return res.status(200).json({ status: "success", attempt: first });
    }
    throw error;
  }
}
