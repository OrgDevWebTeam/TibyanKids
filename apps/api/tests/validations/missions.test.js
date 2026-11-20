import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  observeMissionSchema,
  reflectMissionSchema,
} from "../../src/validations/missionValidation.js";

const fieldsOf = (result) => result.error.issues.map((issue) => issue.path.join("."));

describe("validation: a parent's observation (FR-FAM-002)", () => {
  it("accepts a status alone", () => {
    const result = observeMissionSchema.safeParse({ status: "independent" });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { status: "independent" });
  });

  it("accepts every status, including not observed", () => {
    for (const status of ["independent", "reminder", "not_observed"]) {
      assert.equal(observeMissionSchema.safeParse({ status }).success, true);
    }
  });

  it("trims the note and the client id", () => {
    const { data } = observeMissionSchema.safeParse({
      status: "reminder",
      note: "  Did it after a hint  ",
      clientObservationId: "  abc-1  ",
    });
    assert.equal(data.note, "Did it after a hint");
    assert.equal(data.clientObservationId, "abc-1");
  });

  it("treats a note of only spaces as no note", () => {
    const { data } = observeMissionSchema.safeParse({ status: "reminder", note: "   " });
    assert.equal(data.note, undefined);
  });

  it("accepts a note of 500 characters and refuses 501", () => {
    assert.equal(
      observeMissionSchema.safeParse({ status: "reminder", note: "x".repeat(500) }).success,
      true,
    );
    const tooLong = observeMissionSchema.safeParse({ status: "reminder", note: "x".repeat(501) });
    assert.equal(tooLong.success, false);
    assert.deepEqual(fieldsOf(tooLong), ["note"]);
  });

  it("refuses a missing, unknown or non-text status", () => {
    for (const body of [{}, { status: "perfect" }, { status: 1 }, { status: null }]) {
      const result = observeMissionSchema.safeParse(body);
      assert.equal(result.success, false);
      assert.deepEqual(fieldsOf(result), ["status"]);
    }
  });

  it("refuses a note that is not text", () => {
    const result = observeMissionSchema.safeParse({ status: "reminder", note: { $gt: "" } });
    assert.equal(result.success, false);
    assert.deepEqual(fieldsOf(result), ["note"]);
  });

  it("refuses an empty or too long client id", () => {
    for (const clientObservationId of ["", "   ", "x".repeat(101)]) {
      const result = observeMissionSchema.safeParse({ status: "independent", clientObservationId });
      assert.equal(result.success, false);
      assert.deepEqual(fieldsOf(result), ["clientObservationId"]);
    }
  });

  it("refuses fields a client must never choose", () => {
    for (const extra of [
      { childId: "507f1f77bcf86cd799439011" },
      { familyId: "507f1f77bcf86cd799439011" },
      { result: "met" },
      { weight: 1 },
      { observedBy: "507f1f77bcf86cd799439011" },
    ]) {
      const result = observeMissionSchema.safeParse({ status: "independent", ...extra });
      assert.equal(result.success, false, `accepted ${Object.keys(extra)[0]}`);
    }
  });
});

describe("validation: a child's reflection (FR-FAM-003)", () => {
  it("accepts each fixed choice", () => {
    for (const choice of ["enjoyed_it", "proud", "want_more", "was_hard", "not_sure"]) {
      assert.equal(reflectMissionSchema.safeParse({ choice }).success, true);
    }
  });

  it("refuses free text, a missing choice and a non-text choice", () => {
    for (const body of [{ choice: "I hate it" }, {}, { choice: 3 }]) {
      const result = reflectMissionSchema.safeParse(body);
      assert.equal(result.success, false);
      assert.deepEqual(fieldsOf(result), ["choice"]);
    }
  });

  it("refuses any extra field, such as a free-text comment", () => {
    const result = reflectMissionSchema.safeParse({ choice: "proud", comment: "fun!" });
    assert.equal(result.success, false);
  });
});
