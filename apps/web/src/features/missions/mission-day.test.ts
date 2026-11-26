import { describe, expect, it } from "vitest";
import { dayProgress, pendingFromEarlier, todaysMissions } from "./mission-day";
import { type FamilyMission } from "./missions-api";

const NOW = new Date(2026, 10, 25, 15, 0);
const at = (day: number, hour = 9) => new Date(2026, 10, day, hour).toISOString();

const mission = (overrides: Partial<FamilyMission>): FamilyMission => ({
  id: "m",
  status: "pending",
  title: "Share your snack",
  description: "",
  assignedAt: at(25),
  ...overrides,
});

describe("todaysMissions", () => {
  it("keeps missions given today or answered today", () => {
    const given = mission({ id: "given" });
    const answered = mission({
      id: "answered",
      status: "completed",
      assignedAt: at(23),
      completedAt: at(25, 8),
    });
    const old = mission({
      id: "old",
      status: "completed",
      assignedAt: at(22),
      completedAt: at(23),
    });
    expect(todaysMissions([given, answered, old], NOW).map((m) => m.id)).toEqual([
      "given",
      "answered",
    ]);
  });
});

describe("pendingFromEarlier", () => {
  it("keeps open missions from an earlier day only", () => {
    const yesterday = mission({ id: "yesterday", assignedAt: at(24) });
    const today = mission({ id: "today" });
    const done = mission({ id: "done", status: "completed", assignedAt: at(24) });
    expect(pendingFromEarlier([yesterday, today, done], NOW).map((m) => m.id)).toEqual([
      "yesterday",
    ]);
  });
});

describe("dayProgress", () => {
  it("counts the answered missions among today's", () => {
    expect(dayProgress([mission({ status: "completed" }), mission({})])).toEqual({
      done: 1,
      total: 2,
    });
  });
});
