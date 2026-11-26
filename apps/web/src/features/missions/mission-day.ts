import { type FamilyMission } from "./missions-api";

// Which missions belong to today, as the dashboard and Family Tasks show them (Figma "Parent
// Dashboard": Today's tasks and Pending observations). Days follow the device's clock.

function sameDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Given today, or answered today. */
export function todaysMissions(missions: FamilyMission[], now: Date): FamilyMission[] {
  return missions.filter(
    (mission) =>
      sameDay(mission.assignedAt, now) ||
      (mission.completedAt !== undefined && sameDay(mission.completedAt, now)),
  );
}

/** Still open from an earlier day: the parent can answer, and it still counts toward growth. */
export function pendingFromEarlier(missions: FamilyMission[], now: Date): FamilyMission[] {
  return missions.filter(
    (mission) => mission.status === "pending" && !sameDay(mission.assignedAt, now),
  );
}

/** How many of today's missions the parent has answered. */
export function dayProgress(today: FamilyMission[]): { done: number; total: number } {
  return {
    done: today.filter((mission) => mission.status === "completed").length,
    total: today.length,
  };
}
