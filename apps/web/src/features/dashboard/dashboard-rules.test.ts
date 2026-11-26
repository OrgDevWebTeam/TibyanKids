import { describe, expect, it } from "vitest";
import { dayPart } from "./dashboard-rules";

describe("dayPart", () => {
  it("follows the local clock", () => {
    expect(dayPart(new Date(2026, 10, 25, 9))).toBe("morning");
    expect(dayPart(new Date(2026, 10, 25, 13))).toBe("afternoon");
    expect(dayPart(new Date(2026, 10, 25, 20))).toBe("evening");
  });
});
