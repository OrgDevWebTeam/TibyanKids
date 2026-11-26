import { describe, expect, it } from "vitest";
import { type ChildDetails } from "./children-api";
import {
  addInterest,
  childAge,
  childChanges,
  EMPTY_CHILD_FORM,
  sortByAge,
  toChildForm,
  toNewChild,
  validateChildForm,
} from "./child-profile";

const TODAY = new Date("2026-11-14T10:00:00Z");

const child = (overrides: Partial<ChildDetails>): ChildDetails => ({
  id: "c1",
  name: "Layla",
  dateOfBirth: "2019-02-02",
  ageBand: "6-8",
  homeLanguage: "ar",
  interests: ["Space", "Animals"],
  status: "active",
  ...overrides,
});

describe("sortByAge", () => {
  it("lists the youngest child first", () => {
    const older = child({ id: "y", name: "Yusuf", dateOfBirth: "2016-05-01" });
    const younger = child({ id: "l", name: "Layla", dateOfBirth: "2019-02-02" });
    expect(sortByAge([older, younger]).map((c) => c.id)).toEqual(["l", "y"]);
  });

  it("orders twins by name", () => {
    const b = child({ id: "b", name: "Badr" });
    const a = child({ id: "a", name: "Amal" });
    expect(sortByAge([b, a]).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("childAge", () => {
  it("counts whole years", () => {
    expect(childAge("2019-02-02", TODAY)).toBe(7);
    expect(childAge("2019-12-01", TODAY)).toBe(6);
  });

  it("gives nothing for a date that does not exist", () => {
    expect(childAge("2019-02-30", TODAY)).toBeUndefined();
  });
});

describe("addInterest", () => {
  it("adds a trimmed interest once, whatever its case", () => {
    expect(addInterest(["Space"], "  Cooking ")).toEqual({ interests: ["Space", "Cooking"] });
    expect(addInterest(["Space"], "space")).toEqual({ interests: ["Space"] });
    expect(addInterest(["Space"], "   ")).toEqual({ interests: ["Space"] });
  });

  it("keeps the API's limits", () => {
    expect(addInterest([], "x".repeat(51))).toEqual({ error: "interestTooLong" });
    const full = Array.from({ length: 20 }, (_, i) => `i${i}`);
    expect(addInterest(full, "one more")).toEqual({ error: "tooManyInterests" });
  });
});

describe("validateChildForm", () => {
  const valid = { ...EMPTY_CHILD_FORM, name: "Test Child", dateOfBirth: "2017-03-15" };

  it("accepts a name and a date of birth", () => {
    expect(validateChildForm(valid, TODAY)).toEqual({});
  });

  it("needs a name of 50 characters or fewer", () => {
    expect(validateChildForm({ ...valid, name: "  " }, TODAY).name).toBe("required");
    expect(validateChildForm({ ...valid, name: "x".repeat(51) }, TODAY).name).toBe("tooLong");
  });

  it("needs a real date of birth", () => {
    expect(validateChildForm({ ...valid, dateOfBirth: "" }, TODAY).dateOfBirth).toBe("required");
    expect(validateChildForm({ ...valid, dateOfBirth: "2017-02-30" }, TODAY).dateOfBirth).toBe(
      "required",
    );
  });

  it("needs a child aged 6 to 14", () => {
    expect(validateChildForm({ ...valid, dateOfBirth: "2020-11-15" }, TODAY).dateOfBirth).toBe(
      "ageRange",
    );
    expect(validateChildForm({ ...valid, dateOfBirth: "2011-11-14" }, TODAY).dateOfBirth).toBe(
      "ageRange",
    );
    expect(validateChildForm({ ...valid, dateOfBirth: "2011-11-15" }, TODAY)).toEqual({});
  });

  it("applies the API's limits on interests", () => {
    const many = Array.from({ length: 21 }, (_, i) => `i${i}`);
    expect(validateChildForm({ ...valid, interests: many }, TODAY).interests).toBe(
      "tooManyInterests",
    );
  });
});

describe("toNewChild", () => {
  it("sends the trimmed name with the other fields", () => {
    expect(toNewChild({ ...EMPTY_CHILD_FORM, name: " Huda ", dateOfBirth: "2018-03-14" })).toEqual({
      name: "Huda",
      dateOfBirth: "2018-03-14",
      homeLanguage: "ar",
      interests: [],
    });
  });
});

describe("childChanges", () => {
  it("sends only what changed", () => {
    const saved = child({});
    const form = { ...toChildForm(saved), name: " Lulu ", interests: ["Space", "Stories"] };
    expect(childChanges(saved, form)).toEqual({ name: "Lulu", interests: ["Space", "Stories"] });
  });

  it("sends nothing when nothing changed", () => {
    const saved = child({});
    expect(childChanges(saved, toChildForm(saved))).toEqual({});
  });
});
