import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import { type FamilyMission } from "./missions-api";
import { TaskCard } from "./task-card";

const t = en.familyTasks;
const base: FamilyMission = {
  id: "a1",
  status: "pending",
  title: "Set the table together",
  description: "Let them choose where each plate goes.",
  estimatedMinutes: 10,
};
const render = (mission: FamilyMission) =>
  renderToStaticMarkup(
    <TaskCard t={t} locale="en" mission={mission} onObserve={() => Promise.resolve(true)} />,
  );

describe("TaskCard", () => {
  it("asks how an open task went, with the three answers the API accepts", () => {
    const markup = render(base);
    expect(markup).toContain(t.howDidItGo);
    for (const value of ["independent", "reminder", "not_observed"]) {
      expect(markup).toContain(`value="${value}"`);
    }
    expect(markup).toContain(t.confirm);
    expect(markup).toContain("About 10 min");
  });

  it("shows a done task's answer and note, without a confirm button", () => {
    const markup = render({
      ...base,
      status: "completed",
      observation: { status: "reminder", note: "She remembered the spoons." },
    });
    expect(markup).toMatch(/checked=""[^>]*value="reminder"|value="reminder"[^>]*checked=""/);
    expect(markup).toContain("She remembered the spoons.");
    expect(markup).not.toContain(t.confirm);
  });

  it("says when a task ended without an answer", () => {
    expect(render({ ...base, status: "expired" })).toContain(t.endedBody);
  });
});
