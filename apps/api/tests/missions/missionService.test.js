import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import ChildReflection from "../../src/Models/ChildReflection.js";
import Child from "../../src/Models/Child.js";
import Competency from "../../src/Models/Competency.js";
import Content from "../../src/Models/Content.js";
import EvidenceEvent from "../../src/Models/EvidenceEvent.js";
import Family from "../../src/Models/Family.js";
import GrowthState from "../../src/Models/GrowthState.js";
import MissionAssignment from "../../src/Models/MissionAssignment.js";
import ParentObservation from "../../src/Models/ParentObservation.js";
import {
  assignMission,
  listMissions,
  observeMission,
  reflectOnMission,
} from "../../src/missions/missionService.js";

process.env.JWT_SECRET ??= randomBytes(32).toString("hex");

const newId = () => new mongoose.Types.ObjectId();
let counter = 0;
let replset;

const makeChild = async (overrides = {}) => {
  const family = await Family.create({ name: "Test family", parentId: newId() });
  return Child.create({
    name: "Ahmad",
    // Eight years old: the 6-8 age band
    dateOfBirth: new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 1)),
    familyId: family._id,
    status: "active",
    ...overrides,
  });
};

const makeCompetency = () => {
  counter += 1;
  return Competency.create({
    domain: "quran",
    code: `M-${counter}`,
    name: { ar: "كفاءة", en: "Competency" },
  });
};

// A published mission. Missions need a reviewer who is not the author.
const makeMission = (competencies, overrides = {}) => {
  counter += 1;
  return Content.create({
    title: `Mission ${counter}`,
    type: "mission",
    ageBand: "6-8",
    language: "ar",
    domain: "quran",
    level: 1,
    estimatedMinutes: 5,
    competencies: competencies.map((c) => c._id),
    createdBy: newId(),
    reviewedBy: newId(),
    approvedAt: new Date(),
    status: "published",
    ...overrides,
  });
};

const observation = (child, assignment, overrides = {}) => ({
  child,
  assignmentId: assignment._id,
  userId: newId(),
  status: "independent",
  ...overrides,
});

const rejectsWithStatus = (promise, statusCode) =>
  assert.rejects(promise, (err) => err.statusCode === statusCode);

describe("family loop service (FR-FAM-001 to FR-FAM-003)", () => {
  before(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri());
    await Promise.all(
      [EvidenceEvent, GrowthState, MissionAssignment, ParentObservation, ChildReflection].map((m) =>
        m.init(),
      ),
    );
  });
  after(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }
  });

  describe("assigning a mission", () => {
    it("gives a published mission for the child's age band, and says why", async () => {
      const child = await makeChild();
      const mission = await makeMission([await makeCompetency()]);

      const assignment = await assignMission(child);

      assert.equal(String(assignment.missionId), String(mission._id));
      assert.ok(assignment.reasonRule);
      assert.equal(String(assignment.familyId), String(child.familyId));
    });

    it("gives nothing when there is no suitable published mission", async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      await makeMission([competency], { ageBand: "9-11" }); // wrong age band
      await makeMission([competency], { status: "draft" }); // not published

      assert.equal(await assignMission(child), null);
    });

    it("never gives a child more open missions than the rules allow", async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      for (let i = 0; i < 4; i += 1) await makeMission([competency]);

      for (let i = 0; i < 3; i += 1) assert.ok(await assignMission(child));
      assert.equal(await assignMission(child), null);
      assert.equal(await MissionAssignment.countDocuments(), 3);
    });

    it("one completed lesson leads to one mission", async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      await makeMission([competency]);
      await makeMission([competency]);
      const sourceProgressId = newId();

      assert.ok(await assignMission(child, { sourceProgressId }));
      assert.equal(await assignMission(child, { sourceProgressId }), null);
      assert.equal(await MissionAssignment.countDocuments(), 1);
    });
  });

  describe("observing a mission", () => {
    const setup = async () => {
      const child = await makeChild();
      const competency = await makeCompetency();
      await makeMission([competency]);
      const assignment = await assignMission(child);
      return { child, competency, assignment };
    };

    it("saves the observation, completes the mission and records evidence together", async () => {
      const { child, competency, assignment } = await setup();

      const result = await observeMission(observation(child, assignment));

      assert.equal(result.duplicate, false);
      assert.equal(result.evidence.length, 1);
      assert.equal(await ParentObservation.countDocuments(), 1);
      const saved = await MissionAssignment.findById(assignment._id);
      assert.ok(saved.completedAt);
      const state = await GrowthState.findOne({
        childId: child._id,
        competencyId: competency._id,
      });
      assert.equal(state.status, "assessed");
    });

    it("not observed completes the mission but records no evidence", async () => {
      const { child, assignment } = await setup();

      const result = await observeMission(
        observation(child, assignment, { status: "not_observed" }),
      );

      assert.deepEqual(result.evidence, []);
      assert.equal(await EvidenceEvent.countDocuments(), 0);
      assert.ok((await MissionAssignment.findById(assignment._id)).completedAt);
    });

    it("refuses a second observation of the same mission", async () => {
      const { child, assignment } = await setup();
      await observeMission(observation(child, assignment));

      await rejectsWithStatus(observeMission(observation(child, assignment)), 409);
      assert.equal(await ParentObservation.countDocuments(), 1);
    });

    it("a repeated request with the same clientObservationId saves only once", async () => {
      const { child, assignment } = await setup();
      const input = observation(child, assignment, { clientObservationId: "phone-retry-1" });

      const first = await observeMission(input);
      const second = await observeMission(input);

      assert.equal(first.duplicate, false);
      assert.equal(second.duplicate, true);
      assert.equal(String(second.observation._id), String(first.observation._id));
      assert.equal(await ParentObservation.countDocuments(), 1);
      assert.equal(await EvidenceEvent.countDocuments(), 1);
    });

    it("two requests at the same moment save only one observation", async () => {
      const { child, assignment } = await setup();
      const input = observation(child, assignment, { clientObservationId: "race-1" });

      const results = await Promise.allSettled([observeMission(input), observeMission(input)]);

      assert.equal(results.filter((r) => r.status === "fulfilled").length >= 1, true);
      assert.equal(await ParentObservation.countDocuments(), 1);
      assert.equal(await EvidenceEvent.countDocuments(), 1);
    });

    it("refuses an expired mission", async () => {
      const { child, assignment } = await setup();
      await MissionAssignment.collection.updateOne(
        { _id: assignment._id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

      await rejectsWithStatus(observeMission(observation(child, assignment)), 409);
      assert.equal(await ParentObservation.countDocuments(), 0);
    });

    it("cannot observe a mission of another family: it is not found", async () => {
      const { assignment } = await setup();
      const stranger = await makeChild();

      await rejectsWithStatus(observeMission(observation(stranger, assignment)), 404);
      assert.equal(await ParentObservation.countDocuments(), 0);
    });

    it("an evidence failure undoes the whole observation", async () => {
      const { child, assignment } = await setup();
      // A broken mission id makes the evidence step fail after the observation was saved
      await MissionAssignment.collection.updateOne(
        { _id: assignment._id },
        { $set: { missionId: "not-an-object-id" } },
      );

      await assert.rejects(observeMission(observation(child, assignment)));
      assert.equal(await ParentObservation.countDocuments(), 0);
      assert.equal(
        (await MissionAssignment.findById(assignment._id).lean()).completedAt,
        undefined,
      );
    });
  });

  describe("reflecting on a mission", () => {
    const assigned = async () => {
      const child = await makeChild();
      await makeMission([await makeCompetency()]);
      return { child, assignment: await assignMission(child) };
    };
    const reflection = (child, assignment, choice) => ({
      child,
      assignmentId: assignment._id,
      choice,
    });

    it("saves the child's choice, and it is never evidence", async () => {
      const { child, assignment } = await assigned();

      const result = await reflectOnMission(reflection(child, assignment, "proud"));

      assert.equal(result.duplicate, false);
      assert.equal(result.reflection.choice, "proud");
      assert.equal(await ChildReflection.countDocuments(), 1);
      assert.equal(await EvidenceEvent.countDocuments(), 0);
    });

    it("the same choice again returns the first reflection and saves nothing more", async () => {
      const { child, assignment } = await assigned();

      const first = await reflectOnMission(reflection(child, assignment, "proud"));
      const again = await reflectOnMission(reflection(child, assignment, "proud"));

      assert.equal(again.duplicate, true);
      assert.equal(String(again.reflection._id), String(first.reflection._id));
      assert.equal(await ChildReflection.countDocuments(), 1);
    });

    it("a different choice for the same mission is refused", async () => {
      const { child, assignment } = await assigned();
      await reflectOnMission(reflection(child, assignment, "proud"));

      await rejectsWithStatus(reflectOnMission(reflection(child, assignment, "was_hard")), 409);
      assert.equal(await ChildReflection.countDocuments(), 1);
    });

    it("two requests at the same moment save only one reflection", async () => {
      const { child, assignment } = await assigned();

      const results = await Promise.allSettled([
        reflectOnMission(reflection(child, assignment, "proud")),
        reflectOnMission(reflection(child, assignment, "proud")),
      ]);

      assert.equal(
        results.every((r) => r.status === "fulfilled"),
        true,
      );
      assert.equal(await ChildReflection.countDocuments(), 1);
    });

    it("refuses a new reflection on an expired mission, but still answers a repeat", async () => {
      const { child, assignment } = await assigned();
      await MissionAssignment.collection.updateOne(
        { _id: assignment._id },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
      await rejectsWithStatus(reflectOnMission(reflection(child, assignment, "proud")), 409);

      await ChildReflection.create({
        familyId: child.familyId,
        childId: child._id,
        assignmentId: assignment._id,
        choice: "proud",
      });
      const again = await reflectOnMission(reflection(child, assignment, "proud"));
      assert.equal(again.duplicate, true);
    });
  });

  describe("listing missions", () => {
    it("shows each mission with its status, observation and reflection", async () => {
      const child = await makeChild();
      await makeMission([await makeCompetency()]);
      const assignment = await assignMission(child);

      let [item] = await listMissions(child);
      assert.equal(item.status, "pending");
      assert.equal(item.observation, null);

      await observeMission(
        observation(child, assignment, { status: "reminder", note: "Good try" }),
      );
      await reflectOnMission({ child, assignmentId: assignment._id, choice: "was_hard" });

      [item] = await listMissions(child);
      assert.equal(item.status, "completed");
      assert.deepEqual(item.observation, { status: "reminder", note: "Good try" });
      assert.deepEqual(item.reflection, { choice: "was_hard" });
      assert.ok(item.mission.title);
    });

    it("does not show another family's missions", async () => {
      const child = await makeChild();
      await makeMission([await makeCompetency()]);
      await assignMission(child);
      const stranger = await makeChild();

      assert.deepEqual(await listMissions(stranger), []);
    });
  });
});
