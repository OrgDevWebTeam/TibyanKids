import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Child from "../../src/Models/Child.js";
import User from "../../src/Models/User.js";
import { CHILD_NAME_MAX_LENGTH, USER_NAME_MAX_LENGTH } from "../../src/constants/index.js";
import { registerSchema } from "../../src/validations/authValidation.js";
import { createChildSchema, updateChildSchema } from "../../src/validations/childValidation.js";

const parent = (overrides = {}) => ({
  name: "Amina",
  email: "amina@test.com",
  password: "password123",
  policyVersion: "v1",
  ...overrides,
});
const child = (overrides = {}) => ({ name: "Yusuf", dateOfBirth: "2017-03-15", ...overrides });
const fieldsOf = (result) => result.error.issues.map((issue) => issue.path.join("."));

describe("the validation and the models use the same limits", () => {
  it("a parent's name: the check and the model agree", () => {
    assert.equal(User.schema.path("name").options.maxlength, USER_NAME_MAX_LENGTH);
    const longest = "x".repeat(USER_NAME_MAX_LENGTH);
    assert.equal(registerSchema.safeParse(parent({ name: longest })).success, true);
    assert.equal(registerSchema.safeParse(parent({ name: `${longest}x` })).success, false);
  });

  it("a child's name: the check and the model agree", () => {
    assert.equal(Child.schema.path("name").options.maxlength, CHILD_NAME_MAX_LENGTH);
    const longest = "x".repeat(CHILD_NAME_MAX_LENGTH);
    assert.equal(createChildSchema.safeParse(child({ name: longest })).success, true);
    assert.equal(createChildSchema.safeParse(child({ name: `${longest}x` })).success, false);
    // The child form of the web app allows 50 characters
    assert.equal(CHILD_NAME_MAX_LENGTH, 50);
  });
});

describe("a country is a two-letter code", () => {
  const schemas = {
    registration: (country) => registerSchema.safeParse(parent({ country })),
    "new child": (country) => createChildSchema.safeParse(child({ country })),
    "child update": (country) => updateChildSchema.safeParse({ country }),
  };

  for (const [where, parse] of Object.entries(schemas)) {
    it(`${where}: accepts a code, in capitals whatever way it is sent`, () => {
      for (const sent of ["JO", "jo", " Jo "]) {
        const result = parse(sent);
        assert.equal(result.success, true, `${sent} for ${where}`);
        assert.equal(result.data.country, "JO");
      }
    });

    it(`${where}: refuses free text, empty text, other types and operators`, () => {
      for (const sent of ["Jordan", "J", "JOR", "J0", "J-", "", "   ", 12, null, { $ne: "" }]) {
        const result = parse(sent);
        assert.equal(result.success, false, `${JSON.stringify(sent)} for ${where}`);
        assert.deepEqual(fieldsOf(result), ["country"]);
      }
    });
  }

  it("the message says what to send", () => {
    const result = registerSchema.safeParse(parent({ country: "Jordan" }));
    assert.equal(
      result.error.issues[0].message,
      "Country must be a two-letter country code, for example JO",
    );
  });

  it("the country stays optional when it is left out", () => {
    assert.equal(registerSchema.safeParse(parent()).success, true);
    assert.equal(createChildSchema.safeParse(child()).success, true);
  });
});
