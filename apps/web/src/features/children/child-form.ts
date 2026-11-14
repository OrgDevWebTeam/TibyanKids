/** Ages the prototype serves (CRS: children aged 6 to 14). */
export const MIN_CHILD_AGE = 6;
export const MAX_CHILD_AGE = 14;

/** Same limit as the API. */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/** The G08 number pad takes four digits. */
export const CHILD_PIN_LENGTH = 4;

const PIN_PATTERN = new RegExp(`^\\d{${CHILD_PIN_LENGTH}}$`);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ChildFormValues = {
  displayName: string;
  /** As the date input gives it: YYYY-MM-DD, or empty. */
  dateOfBirth: string;
  pin: string;
  pinConfirm: string;
};

export type ChildFormError = "required" | "tooLong" | "ageRange" | "pinFormat" | "pinMismatch";

export type ChildFormErrors = Partial<Record<keyof ChildFormValues, ChildFormError>>;

export const EMPTY_CHILD_FORM: ChildFormValues = {
  displayName: "",
  dateOfBirth: "",
  pin: "",
  pinConfirm: "",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date input value as a UTC date, or undefined if it is not a real date. */
function parseDate(value: string): Date | undefined {
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

/**
 * Checks the O01 form before it is sent. This is for the parent's convenience only; the API
 * validates every field again.
 */
export function validateChildForm(values: ChildFormValues, today: Date): ChildFormErrors {
  const errors: ChildFormErrors = {};
  const name = values.displayName.trim();

  if (name === "") errors.displayName = "required";
  else if (name.length > DISPLAY_NAME_MAX_LENGTH) errors.displayName = "tooLong";

  const dateOfBirth = parseDate(values.dateOfBirth);
  if (!dateOfBirth) errors.dateOfBirth = "required";
  else {
    const age = ageOn(dateOfBirth, today);
    if (age < MIN_CHILD_AGE || age > MAX_CHILD_AGE) errors.dateOfBirth = "ageRange";
  }

  if (!PIN_PATTERN.test(values.pin)) errors.pin = "pinFormat";
  else if (values.pinConfirm !== values.pin) errors.pinConfirm = "pinMismatch";

  return errors;
}
