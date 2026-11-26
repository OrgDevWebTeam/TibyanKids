import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetAccount,
  rememberChoice,
  saveAccount,
  savedAccounts,
  setRememberChoice,
} from "./saved-accounts";

// Tests run in Node, which has no localStorage: an in-memory stand-in with the same methods.
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  };
}

describe("saved accounts", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("saves the email and a name only, newest first", () => {
    saveAccount("sara@example.com");
    saveAccount("omar@example.com");
    expect(savedAccounts()).toEqual([
      { email: "omar@example.com", name: "Omar" },
      { email: "sara@example.com", name: "Sara" },
    ]);
    expect(localStorage.getItem("tibyan.accounts.v1")).not.toContain("password");
  });

  it("keeps one entry per email, whatever the case, and at most five", () => {
    for (const name of ["a", "b", "c", "d", "e", "f"]) saveAccount(`${name}@example.com`);
    saveAccount("C@EXAMPLE.COM");
    const emails = savedAccounts().map((account) => account.email);
    expect(emails).toHaveLength(5);
    expect(emails[0]).toBe("C@EXAMPLE.COM");
    expect(emails.filter((email) => email.toLowerCase() === "c@example.com")).toHaveLength(1);
  });

  it("keeps the name the parent gave, and does not lose it on a later save without one", () => {
    saveAccount("sara@example.com", "سارة أحمد");
    saveAccount("sara@example.com");
    expect(savedAccounts()).toEqual([{ email: "sara@example.com", name: "سارة أحمد" }]);
  });

  it("forgets an account", () => {
    saveAccount("sara@example.com");
    forgetAccount("SARA@example.com");
    expect(savedAccounts()).toEqual([]);
  });

  it("ignores broken storage", () => {
    localStorage.setItem("tibyan.accounts.v1", "{not json");
    expect(savedAccounts()).toEqual([]);
  });

  it("starts with Remember me ticked", () => {
    expect(rememberChoice()).toBe(true);
    setRememberChoice(false);
    expect(rememberChoice()).toBe(false);
  });
});
