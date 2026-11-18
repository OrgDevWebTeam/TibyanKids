import Child from "../Models/Child.js";
import MissionAssignment from "../Models/MissionAssignment.js";
import { invalidInput } from "../middlewares/validate.js";
import { listMissions, observeMission, reflectOnMission } from "../missions/missionService.js";
import AppError from "../utils/AppError.js";
import { auditIfOtherFamily } from "../utils/auditCrossFamily.js";
import { findMyChild } from "../utils/findMyChild.js";
import { missionsQuery } from "../validations/missionValidation.js";

// The family loop endpoints (FR-FAM-001 to FR-FAM-003, API-005). Each action exists twice:
// under the child (/children/:id/missions/...) and as the CRS paths (/missions/...). Both end in the
// same service functions, so they behave the same.
//
// Another family's child or mission is a 404, and is written to the audit log.

// The child in the URL (:id), if it belongs to the parent's family
async function childOfUrl(req) {
  const child = await findMyChild(req);
  if (!child) throw new AppError(404, "Child not found");
  return child;
}

// A child by id (the ?childId= of GET /missions), if it belongs to the parent's family
async function childById(req, childId) {
  // $eq makes sure the id is only ever compared as a value, never read as a query operator.
  const child = await Child.findOne({
    _id: { $eq: childId },
    familyId: req.family._id,
    status: { $ne: "archived" },
  });
  if (!child) {
    await auditIfOtherFamily(req, childId);
    throw new AppError(404, "Child not found");
  }
  return child;
}

// The child of the mission in the URL (:assignmentId), if the mission belongs to the parent's family
async function childOfAssignment(req) {
  const assignment = await MissionAssignment.findOne({
    _id: { $eq: req.params.assignmentId },
  }).select("childId familyId");
  if (!assignment) throw new AppError(404, "Mission not found");

  if (!assignment.familyId.equals(req.family._id)) {
    await auditIfOtherFamily(req, assignment.childId);
    throw new AppError(404, "Mission not found");
  }
  const child = await Child.findOwned(assignment.childId, req.family._id)
    .where("status")
    .ne("archived");
  if (!child) throw new AppError(404, "Mission not found");
  return child;
}

async function sendMissions(res, child) {
  const missions = await listMissions(child);
  res.json({ status: "success", count: missions.length, missions });
}

// 201 for a new observation, 200 when the same clientObservationId was already saved
function sendObservation(res, { observation, evidence, duplicate }) {
  res.status(duplicate ? 200 : 201).json({
    status: "success",
    duplicate,
    observation: {
      id: observation._id,
      assignmentId: observation.assignmentId,
      status: observation.status,
      note: observation.note ?? null,
      createdAt: observation.createdAt,
    },
    evidenceRecorded: evidence.length,
  });
}

// 201 for a new reflection, 200 when the same choice was already saved
function sendReflection(res, { reflection, duplicate }) {
  res.status(duplicate ? 200 : 201).json({
    status: "success",
    duplicate,
    reflection: {
      id: reflection._id,
      assignmentId: reflection.assignmentId,
      choice: reflection.choice,
      createdAt: reflection.createdAt,
    },
  });
}

const observationInput = (req, child) => ({
  child,
  assignmentId: req.params.assignmentId,
  userId: req.user._id,
  // Only the three validated fields are picked: the body is never passed on as a whole
  status: req.body.status,
  note: req.body.note,
  clientObservationId: req.body.clientObservationId,
});

const reflectionInput = (req, child) => ({
  child,
  assignmentId: req.params.assignmentId,
  choice: req.body.choice,
});

// Under the child: /children/:id/missions...
export async function listChildMissions(req, res) {
  await sendMissions(res, await childOfUrl(req));
}

export async function observeChildMission(req, res) {
  const child = await childOfUrl(req);
  sendObservation(res, await observeMission(observationInput(req, child)));
}

export async function reflectChildMission(req, res) {
  const child = await childOfUrl(req);
  sendReflection(res, await reflectOnMission(reflectionInput(req, child)));
}

// The CRS paths: /missions?childId=..., /missions/:assignmentId/observe, /missions/:assignmentId/reflect
export async function listFamilyMissions(req, res) {
  const query = missionsQuery.safeParse(req.query);
  if (!query.success) return invalidInput(res, query.error.issues);
  await sendMissions(res, await childById(req, query.data.childId));
}

export async function observeMissionById(req, res) {
  const child = await childOfAssignment(req);
  sendObservation(res, await observeMission(observationInput(req, child)));
}

export async function reflectMissionById(req, res) {
  const child = await childOfAssignment(req);
  sendReflection(res, await reflectOnMission(reflectionInput(req, child)));
}
