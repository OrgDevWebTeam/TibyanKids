import { describe, expect, it } from "vitest";
import {
  confirmError,
  emailError,
  fill,
  NAME_MAX_LENGTH,
  nameError,
  nameFromEmail,
  passwordError,
  passwordStrength,
} from "./auth-rules";

describe("nameError", () => {
  it("needs a name", () => {
    expect(nameError("   ")).toBe("nameRequired");
  });

  it("accepts a name in either language, up to the length the database keeps", () => {
    expect(nameError(" Sara Ahmad ")).toBeUndefined();
    expect(nameError("سارة أحمد")).toBeUndefined();
    expect(nameError("a".repeat(NAME_MAX_LENGTH))).toBeUndefined();
    expect(nameError("a".repeat(NAME_MAX_LENGTH + 1))).toBe("nameTooLong");
  });
});

describe("emailError", () => {
  it("needs an email", () => {
    expect(emailError("  ")).toBe("emailRequired");
  });

  it("needs a full address", () => {
    expect(emailError("name@example")).toBe("emailInvalid");
    expect(emailError("name example.com")).toBe("emailInvalid");
    expect(emailError(" name@example.com ")).toBeUndefined();
  });
});

describe("passwordError and confirmError", () => {
  it("needs at least 8 characters", () => {
    expect(passwordError("")).toBe("passwordRequired");
    expect(passwordError("1234567")).toBe("passwordTooShort");
    expect(passwordError("12345678")).toBeUndefined();
  });

  it("needs the same password twice", () => {
    expect(confirmError("", "secret-12")).toBe("confirmRequired");
    expect(confirmError("secret-13", "secret-12")).toBe("confirmMismatch");
    expect(confirmError("secret-12", "secret-12")).toBeUndefined();
  });
});

describe("passwordStrength", () => {
  it("rates length and variety", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdefgh")).toBe(2);
    expect(passwordStrength("abcdEFG1")).toBe(3);
    expect(passwordStrength("abcdefghijkl")).toBe(3);
  });
});

describe("nameFromEmail", () => {
  it("makes a name from the part before @", () => {
    expect(nameFromEmail("sara.ahmad92@example.com")).toBe("Sara Ahmad");
    expect(nameFromEmail("omar_k@example.com")).toBe("Omar K");
  });

  it("falls back to the part before @ when it has no letters", () => {
    expect(nameFromEmail("1234@example.com")).toBe("1234");
  });
});

describe("fill", () => {
  it("replaces known keys and keeps unknown ones", () => {
    expect(fill("Hi {name}, {other}", { name: "Sara" })).toBe("Hi Sara, {other}");
  });
});
