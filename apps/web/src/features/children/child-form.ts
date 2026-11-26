/** Ages the prototype serves (CRS: children aged 6 to 14). */
export const MIN_CHILD_AGE = 6;
export const MAX_CHILD_AGE = 14;

/** Same limit as the API (CHILD_NAME_MAX_LENGTH). */
export const DISPLAY_NAME_MAX_LENGTH = 50;

/** The G08 number pad takes four digits. */
export const CHILD_PIN_LENGTH = 4;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date input value as a UTC date, or undefined if it is not a real date. */
export function parseDate(value: string): Date | undefined {
  if (!DATE_PATTERN.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? undefined : date;
}

/** Age in whole years on `today`, counted in UTC like the API does. */
export function ageOn(dateOfBirth: Date, today: Date): number {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const months = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (months < 0 || (months === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
}

/** The earliest and latest dates of birth for a child aged 6 to 14 today, for the date input. */
export function dateOfBirthRange(today: Date): { min: string; max: string } {
  const latest = new Date(today);
  latest.setUTCFullYear(today.getUTCFullYear() - MIN_CHILD_AGE);
  const earliest = new Date(today);
  earliest.setUTCFullYear(today.getUTCFullYear() - MAX_CHILD_AGE - 1);
  earliest.setUTCDate(earliest.getUTCDate() + 1);
  return { min: toIsoDate(earliest), max: toIsoDate(latest) };
}
