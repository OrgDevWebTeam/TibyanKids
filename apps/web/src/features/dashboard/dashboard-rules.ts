// Rules for the parent dashboard (Figma "Parent Dashboard"). Pure functions, easy to test.

/** Morning until noon, afternoon until 6 pm, evening after that, by the device's clock. */
export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(now: Date): DayPart {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  return hour < 18 ? "afternoon" : "evening";
}
