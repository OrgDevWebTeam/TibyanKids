import { describe, expect, it } from "vitest";
import { ageOn, dateOfBirthRange, validateChildForm } from "./child-form";

const TODAY = new Date("2026-11-14T10:00:00Z");
const valid = {
  displayName: "Test Child",
  dateOfBirth: "2017-03-15",
  pin: "1234",
  pinConfirm: "1234",
};

describe("ageOn", () => {
  it("counts whole years, like the API", () => {
    expect(ageOn(new Date("2020-11-14T00:00:00Z"), TODAY)).toBe(6);
    expect(ageOn(new Date("2020-11-15T00:00:00Z"), TODAY)).toBe(5);
  });
});

describe("dateOfBirthRange", () => {
  it("covers ages 6 to 14 on the given day", () => {
    expect(dateOfBirthRange(TODAY)).toEqual({ min: "2011-11-15", max: "2020-11-14" });
  });
});

describe("validateChildForm", () => {
  it("accepts a complete form", () => {
    expect(validateChildForm(valid, TODAY)).toEqual({});
  });

  it("needs a name of at most 40 characters", () => {
    expect(validateChildForm({ ...valid, displayName: "  " }, TODAY)).toEqual({
      displayName: "required",
    });
    expect(validateChildForm({ ...valid, displayName: "a".repeat(41) }, TODAY)).toEqual({
      displayName: "tooLong",
    });
  });

  it("needs a real date of birth", () => {
    expect(validateChildForm({ ...valid, dateOfBirth: "" }, TODAY)).toEqual({
      dateOfBirth: "required",
    });
    expect(validateChildForm({ ...valid, dateOfBirth: "2017-02-30" }, TODAY)).toEqual({
      dateOfBirth: "required",
    });
  });

  it("needs a child aged 6 to 14", () => {
    expect(validateChildForm({ ...valid, dateOfBirth: "2020-11-15" }, TODAY)).toEqual({
      dateOfBirth: "ageRange",
    });
    expect(validateChildForm({ ...valid, dateOfBirth: "2011-11-14" }, TODAY)).toEqual({
      dateOfBirth: "ageRange",
    });
    expect(validateChildForm({ ...valid, dateOfBirth: "2011-11-15" }, TODAY)).toEqual({});
  });

  it("needs a four-digit PIN typed twice", () => {
    expect(validateChildForm({ ...valid, pin: "12a4", pinConfirm: "12a4" }, TODAY)).toEqual({
      pin: "pinFormat",
    });
    expect(validateChildForm({ ...valid, pin: "123456", pinConfirm: "123456" }, TODAY)).toEqual({
      pin: "pinFormat",
    });
    expect(validateChildForm({ ...valid, pinConfirm: "4321" }, TODAY)).toEqual({
      pinConfirm: "pinMismatch",
    });
  });
});
