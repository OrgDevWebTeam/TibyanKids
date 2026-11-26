import { describe, expect, it } from "vitest";
import { ageOn, dateOfBirthRange, parseDate } from "./child-form";

const TODAY = new Date("2026-11-14T10:00:00Z");

describe("parseDate", () => {
  it("reads a date input value and refuses a day that does not exist", () => {
    expect(parseDate("2017-03-15")?.toISOString()).toBe("2017-03-15T00:00:00.000Z");
    expect(parseDate("2017-02-30")).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
  });
});

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
